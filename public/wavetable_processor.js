class WavetableProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    this.wavetable = options.processorOptions.npyArray;

    this.phase = 0;
  }

  _wavetableLookup(phase, x, y) {
    const index =
      Math.floor(phase) * this.wavetable.stride[0] +
      Math.floor(x) * this.wavetable.stride[1] +
      Math.floor(y) * this.wavetable.stride[2];
    return this.wavetable.data[index];
  }

  _trilinearLookup(phase, x, y) {
    const p0 = Math.floor(phase);
    const p1 = Math.ceil(phase);
    const x0 = Math.floor(x);
    const x1 = Math.ceil(x);
    const y0 = Math.floor(y);
    const y1 = Math.ceil(y);

    const pd = (phase - p0) / (p1 - p0);
    const xd = (x - x0) / (x1 - x0);
    const yd = (y - y0) / (y1 - y0);

    const c000 = this._wavetableLookup(p0, x0, y0);
    const c100 = this._wavetableLookup(p1, x0, y0);
    const c001 = this._wavetableLookup(p0, x0, y1);
    const c101 = this._wavetableLookup(p1, x0, y1);
    const c010 = this._wavetableLookup(p0, x1, y0);
    const c110 = this._wavetableLookup(p1, x1, y0);
    const c011 = this._wavetableLookup(p0, x1, y1);
    const c111 = this._wavetableLookup(p1, x1, y1);

    const c00 = c000 * (1 - pd) + c100 * pd;
    const c01 = c001 * (1 - pd) + c101 * pd;
    const c10 = c010 * (1 - pd) + c110 * pd;
    const c11 = c011 * (1 - pd) + c111 * pd;

    const c0 = c00 * (1 - xd) + c10 * xd;
    const c1 = c01 * (1 - xd) + c11 * xd;

    const c = c0 * (1 - yd) + c1 * yd;

    return c;
  }

  _sampleWavetable(phase, x, y) {
    const phaseRange = this.wavetable.shape[0] - 1;
    const xRange = this.wavetable.shape[1] - 1;
    const yRange = this.wavetable.shape[2] - 1;
    const phase_ = this._clamp(
      (phase / (2 * Math.PI)) * phaseRange,
      0,
      phaseRange
    );
    const x_ = this._clamp(x * xRange, 0, xRange);
    const y_ = this._clamp(y * yRange, 0, yRange);
    const sample = this._trilinearLookup(phase_, x_, y_);
    return sample;
  }

  _clamp(x, min, max) {
    return Math.min(Math.max(x, min), max);
  }

  static get parameterDescriptors() {
    return [
      { name: "x", defaultValue: 0.0 },
      { name: "y", defaultValue: 0.0 },
      { name: "gain", defaultValue: 0.0 },
      { name: "frequency", defaultValue: 174.614 },
    ];
  }

  process(inputs, outputs, params) {
    const blockSize = outputs[0][0].length;
    const outputSignal = [];

    for (let n = 0; n < blockSize; n++) {
      const freq =
        params.frequency.length === blockSize
          ? params.frequency[n]
          : params.frequency[0];
      const gain =
        params.gain.length === blockSize ? params.gain[n] : params.gain[0];
      const x = params.x.length === blockSize ? params.x[n] : params.x[0];
      const y = params.y.length === blockSize ? params.y[n] : params.y[0];

      this.phase += (2 * Math.PI * freq) / sampleRate;
      while (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;

      let output = gain * this._sampleWavetable(this.phase, x, y);
      if (isNaN(output)) {
        output = 0;
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

registerProcessor("wavetable_processor", WavetableProcessor);
