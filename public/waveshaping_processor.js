class WaveshapingProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();

        this.note_on_ = false;
        this.port.onmessage = event => {
            if (event.data.type === 'note_on') {
                this.noteOn(event.data.note);
            }
            else if (event.data.type === 'note_off') {
                this.noteOff();
            }
        };

        this.waveshaper = options.processorOptions.npyArray;
        console.log(this.waveshaper);

        this.phase = 0;
        this.frames = 0;
    }

    _applyWaveshaper(sample, x, y) {
        const sampleRange = this.waveshaper.shape[0] - 1;
        const xRange = this.waveshaper.shape[1] - 1;
        const yRange = this.waveshaper.shape[2] - 1;
        const sample_ = this._clamp((sample + 1) * 0.5 * sampleRange, 0, sampleRange);
        const x_ = this._clamp(x * xRange, 0, xRange);
        const y_ = this._clamp(y * yRange, 0, yRange);

        const index = Math.floor(sample_) * this.waveshaper.stride[0] + Math.floor(x_) * this.waveshaper.stride[1] + Math.floor(y_) * this.waveshaper.stride[2];
        if (this.frames >= sampleRate) {
            console.log(x);
        }

        return this.waveshaper.data[index];
    }

    _clamp(x, min, max) {
        return Math.min(Math.max(x, min), max);
    }

    noteOn(note) {
        this.note_freq_ = 2 ** ((note - 69)/12) * 440.0;
        this.note_on_ = true;
    }

    noteOff() {
        this.note_on_ = false;
    }

    static get parameterDescriptors() {
        return [
            { name: 'x', defaultValue: 0.5 }, 
            { name: 'y', defaultValue: 0.5 }
        ];
    }

    process(inputs, outputs, params) {
        const blockSize = outputs[0][0].length;
        const outputSignal = [];

        if (!this.note_on_) {
            return true;
        }

        for (let n = 0; n < blockSize; n++) {
            this.frames += 1;
            this.phase += 2 * Math.PI * this.note_freq_ / sampleRate;
            while (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
            const exciterSample = Math.sin(this.phase);
            const output = this._applyWaveshaper(exciterSample, params.x[0], params.y[0]);
            if (this.frames >= sampleRate) {
                console.log(output);
                this.frames = 0;
            }
            outputSignal.push(output);
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

registerProcessor('waveshaping_processor', WaveshapingProcessor);