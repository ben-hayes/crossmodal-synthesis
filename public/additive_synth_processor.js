class AdditiveSynthProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        this.wavetable = this._makeWavetable(4096);

        this.note_on_ = false;
        this.port.onmessage = event => {
            if (event.data.type === 'note_on') {
                this.noteOn(event.data.note);
            }
            else if (event.data.type === 'note_off') {
                this.noteOff();
            }
        };

        this.phase = 0;
    }

    _makeWavetable(N) {
        const wavetable = [];
        for (let n = 0; n < N; n++) {
            wavetable.push(Math.sin(2 * Math.PI * n / N));
        }
        return wavetable;
    }

    _sin(x) {
        while (x < 0) {
            x += 2 * Math.PI;
        }
        while (x > 2 * Math.PI) {
            x -= 2 * Math.PI;
        }
        x = x * this.wavetable.length / (2 * Math.PI);

        const integral = Math.floor(x);
        const fraction = x - integral;

        const lower = this.wavetable[integral];
        const upper = this.wavetable[integral % this.wavetable.length];

        const interp = lower + (upper - lower) * fraction;

        return interp;
    }

    noteOn(note) {
        this.note_freq_ = 2 ** ((note - 69)/12) * 440.0;
        this.note_on_ = true;
    }

    noteOff() {
        this.note_on_ = false;
    }

    static get parameterDescriptors() {
        const defaultNPartials = 12;
        const defaultPartialAmplitudes = [];

        for (let i = 0; i < defaultNPartials; i++) {
            defaultPartialAmplitudes.push(Math.random());
        }

        const params = [
            { name: 'nPartials', defaultValue: defaultNPartials },
        ];

        for (let i = 0; i < defaultPartialAmplitudes.length; i++) {
            params.push({
                name: 'controllable_partialAmplitude' + i,
                defaultValue: defaultPartialAmplitudes[i] 
            });
        }

        return params;
    }

    process(inputs, outputs, params) {
        const blockSize = outputs[0][0].length;
        const outputSignal = [];

        if (!this.note_on_) {
            return true;
        }

        for (let n = 0; n < blockSize; n++) {
            this.phase += 2 * Math.PI * this.note_freq_ / sampleRate;
            while (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;

            let sample = 0;
            let totalAmp = 0;
            for (let i = 0; i < params.nPartials; i++) {
                if ((i + 1) * this.note_freq_ > sampleRate / 2) {
                    break;
                }
                const amp = params['controllable_partialAmplitude' + i][0];
                totalAmp += Math.abs(amp);

                sample += amp *
                    this._sin((i + 1) * this.phase);
            }
            sample = sample / totalAmp;
            outputSignal.push(sample);
        }

        for (let output of outputs) {
            for (let channel of output) {
                for (let n = 0; n < channel.length; n++) {
                    channel[n] = outputSignal[n];
                }
            }
        }
        return true;
    }
}

registerProcessor('additive_synth_processor', AdditiveSynthProcessor);