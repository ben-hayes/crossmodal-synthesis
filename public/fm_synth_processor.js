/**
 * Enumeration of ADSR envelope states
 */
 const ADSRStates = {
    ATTACK: 'attack',
    DECAY: 'decay',
    SUSTAIN: 'sustain',
    RELEASE: 'release',
    SILENT: 'silent',
}

const THRESH = 0.00001;

/**
 * Represents an ADSR envelope
 *
 * @class ADSR
 */
class ADSR {
    /**
     * Creates an instance of ADSR.
     * @param {*} segmentLength Length of envelope segments
     * @param {*} sampleRate Sample rate in Hz
     * @memberof ADSR
     */
    constructor (segmentLength, sampleRate) {
        this.phase_ = 0;
        this.segmentLength_ = segmentLength;
        this.state_ = ADSRStates.SILENT;
        this.sample_rate_ = sampleRate;

        this.attack_ = 0.1;
        this.decay_ = 0.5;
        this.sustain_ = 0.3;
        this.release_ = 0.4;

        this.calculateAlpha();

        this.releaseAmp_ = 0.0;
        this.attackAmp_ = 0.0;
        this.lastEnvValue_ = 0.0;
    }

    /**
     * Sets the envelope's alpha time constants based on the attack and decay
     * params
     *
     * @memberof ADSR
     */
    calculateAlpha() {
        this.alpha_decay = Math.exp(-1/this.decay_);
        this.alpha_release =Math.exp(-1/this.release_);
    }

    /**
     * Sets the envelope's internal parameters so that the next computed frame
     * uses them.
     *
     * @param {*} attack Attack segment. Expects range [0.0, 1.0]. Exponentiates
     *  given value internally.
     * @param {*} decay Decay segment. Expects range [0.0, 1.0]. Exponentiates
     *  given value internally.
     * @param {*} sustain Sustain level. Expects range [0.0, 1.0].
     * @param {*} release Release segment. Expects range [0.0, 1.0]. 
     *  Exponentiates given value internally.
     * @memberof ADSR
     */
    setParams(attack, decay, sustain, release) {
        this.attack_ = (attack ** 3.0) * this.segmentLength_;
        this.decay_ = (decay ** 3.0) * this.segmentLength_;
        this.sustain_ = sustain;
        this.release_ = (release ** 3.0) * this.segmentLength_;
        this.calculateAlpha();
    }

    /**
     * Start attack segment of sound (i.e. trigger note-on)
     *
     * @memberof ADSR
     */
    attack() {
        this.phase_ = 0;
        this.state_ = ADSRStates.ATTACK;
        this.attackAmp_ = this.lastEnvValue_;
    }

    /**
     * Start release segment of sound (i.e. trigger note-off)
     *
     * @memberof ADSR
     */
    release() {
        if (this.state_ === ADSRStates.RELEASE 
            || this.state_ === ADSRStates.SILENT) return;

        this.releaseAmp_ = this.lastEnvValue_;
        this.state_ = ADSRStates.RELEASE;
        this.phase_ = 0;
    }

    /**
     * Compute next envelope output value
     *
     * @returns Next envelope value
     * @memberof ADSR
     */
    process() {
        let envValue = 0.0;

        // ADSR envelope is essentially a state machine
        switch (this.state_) {
            case ADSRStates.ATTACK:
                if (this.lastEnvValue_ < 1 - THRESH) {
                    envValue =
                        this.attackAmp_
                        + (this.phase_ / (this.attack_ > 0 ? this.attack_ : 1))
                        * (1.0 - this.attackAmp_);
                    this.phase_ += 1;
                } else {
                    this.state_ = ADSRStates.DECAY;
                    this.phase_ = 0;
                    envValue = 1;
                }
            break;

            case ADSRStates.DECAY:
                const diff = this.lastEnvValue_ - this.sustain_;
                if (diff > THRESH) {
                    envValue = diff * this.alpha_decay + this.sustain_;
                    this.phase_ += 1;
                } else {
                    this.state_ = ADSRStates.SUSTAIN;
                    this.phase_ = 0;
                    envValue = this.sustain_;
                }
            break;

            case ADSRStates.SUSTAIN:
                envValue = this.sustain_;
            break;

            case ADSRStates.RELEASE:
                if (this.lastEnvValue_ > THRESH) {
                    envValue = this.lastEnvValue_ * this.alpha_release;
                    this.phase_ += 1;
                } else {
                    this.state_ = ADSRStates.SILENT;
                    this.phase_ = 0;
                }
            break;
        }

        const diff = envValue - this.lastEnvValue_;
        if (Math.abs(diff) > 0.004) {
            envValue = this.lastEnvValue_ + diff * 0.004;
        }

        this.lastEnvValue_ = envValue;
        return envValue;
    }
}

/**
 * Represents the DSP core of the FM synth. Runs in real time on a dedicated
 * audio thread.
 *
 * @class FMSynthProcessor
 * @extends {AudioWorkletProcessor}
 */
class FMSynthProcessor extends AudioWorkletProcessor {
    /**
     * Creates an instance of FMSynthProcessor.
     * @memberof FMSynthProcessor
     */
    constructor () {
        super();

        this.envStageMaxLength = 2 * sampleRate; // 2 second env segments

        // one env per operator... everything is hardcoded for now as I'm fairly
        // sure JS's dynamic memory allocation/garbage collection would not
        // play nicely with real time audio.
        this.env1 = new ADSR(this.envStageMaxLength, sampleRate);
        this.env2 = new ADSR(this.envStageMaxLength, sampleRate);
        this.env3 = new ADSR(this.envStageMaxLength, sampleRate);

        this.op1_phase_ = 0.0;
        this.op2_phase_ = 0.0;
        this.op3_phase_ = 0.0;
        this.note_freq = 110.0;

        // A sort of virtual serial channel for receiving messages from the
        // UI thread. This is how we get our note ons and offs.
        this.port.onmessage = event => {
            if (event.data.type === 'note_on') {
                this.noteOn(event.data.note);
            }
            else if (event.data.type === 'note_off') {
                this.noteOff();
            }
        };
    }

    /**
     * Trigger a note on
     *
     * @param {*} note The MIDI note number
     * @memberof FMSynthProcessor
     */
    noteOn(note) {
        this.note_freq = 2 ** ((note - 69)/12) * 440.0;
        this.env1.attack();
        this.env2.attack();
        this.env3.attack();
        this.op1_phase_ = 0.0;
        this.op2_phase_ = 0.0;
        this.op3_phase_ = 0.0;
    }

    /**
     * Trigger a note off
     *
     * @memberof FMSynthProcessor
     */
    noteOff() {
        this.note_on_ = false;
        this.env1.release();
        this.env2.release();
        this.env3.release();
    }

    /**
     * A getter for parameter settings
     *
     * @readonly
     * @static
     * @memberof FMSynthProcessor
     */
    static get parameterDescriptors() {
        return [
            { name: 'tuning_1', defaultValue: 1.0 },
            { name: 'gain_1', defaultValue: 0.7 },
            { name: 'attack_1', defaultValue: 0.01 },
            { name: 'decay_1', defaultValue: 0.1 },
            { name: 'sustain_1', defaultValue: 0.0 },
            { name: 'release_1', defaultValue: 0.2 },
            { name: 'tuning_2', defaultValue: 1.0 },
            { name: 'gain_2', defaultValue: 0.0 },
            { name: 'attack_2', defaultValue: 0.3 },
            { name: 'decay_2', defaultValue: 0.1 },
            { name: 'sustain_2', defaultValue: 0.5 },
            { name: 'release_2', defaultValue: 0.2 },
            { name: 'tuning_3', defaultValue: 1.0 },
            { name: 'gain_3', defaultValue: 0.0 },
            { name: 'attack_3', defaultValue: 0.2 },
            { name: 'decay_3', defaultValue: 0.8 },
            { name: 'sustain_3', defaultValue: 0.5 },
            { name: 'release_3', defaultValue: 0.2 }
        ];
    }

    /**
     * Computes the next output sample
     *
     * @param {*} inputs
     * @param {*} outputs
     * @param {*} params
     * @returns
     * @memberof FMSynthProcessor
     */
    process(inputs, outputs, params) {
        // Update envelope parameters
        this.env1.setParams(
            params.attack_1[0],
            params.decay_1[0],
            params.sustain_1[0],
            params.release_1[0]);
        this.env2.setParams(
            params.attack_2[0],
            params.decay_2[0],
            params.sustain_2[0],
            params.release_2[0]);
        this.env3.setParams(
            params.attack_3[0],
            params.decay_3[0],
            params.sustain_3[0],
            params.release_3[0]);

        for (let output of outputs) {
            for (let channel of output) {
                for (let n = 0; n < channel.length; n++) {
                    // Generate next envelope sample
                    const env1_amp = this.env1.process();
                    const env2_amp = this.env2.process();
                    const env3_amp = this.env3.process();

                    // As mentioned in the constructor, routing resolution is
                    // hardcoded for now.
                    const op3_out =
                        6.283 * env3_amp 
                        * params.gain_3[0] * Math.sin(this.op3_phase_);
                    const op2_out =
                        6.283 * env2_amp
                        * params.gain_2[0] * Math.sin(this.op2_phase_);
                    const op1_out = env1_amp * params.gain_1[0] * Math.sin(
                        this.op1_phase_ + op2_out + op3_out);

                    // Update phase of each operator
                    const op1_multiplier = params.tuning_1[0];
                    this.op1_phase_ +=
                        op1_multiplier * 
                            2.0 * Math.PI * this.note_freq / sampleRate;
                    while (this.op1_phase_ >= 2.0 * Math.PI) {
                        this.op1_phase_ -= 2.0 * Math.PI;
                    }

                    const op2_multiplier = params.tuning_2[0];
                    this.op2_phase_ +=
                        op2_multiplier * 
                            2.0 * Math.PI * this.note_freq / sampleRate;
                    while (this.op2_phase_ >= 2.0 * Math.PI) {
                        this.op2_phase_ -= 2.0 * Math.PI;
                    }
                    
                    const op3_multiplier = params.tuning_3[0];
                    this.op3_phase_ +=
                        op3_multiplier * 
                            2.0 * Math.PI * this.note_freq / sampleRate;
                    while (this.op3_phase_ >= 2.0 * Math.PI) {
                        this.op3_phase_ -= 2.0 * Math.PI;
                    }

                    // Assign the sample to the relevant output channel
                    channel[n] = op1_out;
                }
            }
        }
        return true;
    }
}

registerProcessor('fm_synth_processor', FMSynthProcessor);
