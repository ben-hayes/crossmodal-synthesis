import ndarray from "ndarray";
import npyjs from "npyjs";
import React from "react";

import { repeatingRbf, noteToFreq } from "./utils";

class Synth {
  constructor(processorName, processorFile, processorOptions) {
    this.processorName = processorName;
    this.processorFile = processorFile;
    this.processorFile = processorFile;

    this.audioStarted = false;
    this.context = undefined;
    this.synth = undefined;
  }

  async initialiseSynth() {
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    await audioContext.audioWorklet.addModule(this.processorFile);
    const synth = new window.AudioWorkletNode(
      audioContext,
      this.processorName,
      { processorOptions: this.processorOptions }
    );

    synth.connect(audioContext.destination);

    this.audioStarted = true;
    this.context = audioContext;
    this.synth = synth;
    console.log(`Processor ${this.processorName} Loaded`);
  }

  isInitialised() {
    return this.audioStarted;
  }

  setParam(name, value) {
    this.synth.parameters
      .get(name)
      .linearRampToValueAtTime(value, this.context.currentTime + 0.1);
  }

  noteOn(note) {
    this.synth.parameters
      .get("gain")
      .linearRampToValueAtTime(1.0, this.context.currentTime + 0.1);
    this.synth.parameters
      .get("frequency")
      .linearRampToValueAtTime(
        noteToFreq(note),
        this.context.currentTime + 0.01
      );
  }

  noteOff() {
    this.synth.parameters
      .get("gain")
      .linearRampToValueAtTime(0.0, this.context.currentTime + 0.1);
  }
}

class LookupTableSynth extends Synth {
  constructor(processorName, processorFile, lookupTableFile) {
    super(processorName, processorFile, {});
    this.lookupTableFile = lookupTableFile;
  }

  async _blockingLoadNpy(filename) {
    let loaded = false;
    let output = undefined;
    const n = new npyjs();
    n.load(filename, (res) => {
      output = res;
      loaded = true;
      console.log("Numpy data loaded");
    });

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    while (!loaded) {
      await sleep(100);
    }
    return output;
  }

  async initialiseSynth() {
    const npyData = await this._blockingLoadNpy(this.lookupTableFile);
    const npyArray = ndarray(npyData.data, npyData.shape);
    this.processorOptions = {
      npyArray,
    };
    await super.initialiseSynth();
  }
}

class ExperimentSynth extends LookupTableSynth {
  constructor() {
    super(
      "wavetable_processor",
      "wavetable_processor.js",
      "waveshaper_grid.npy"
    );
  }

  static getParams(x, y) {
    return {
      x,
      y,
      modGain:
        0.5 *
        (repeatingRbf(x + 0.25, 16, 0.4) + repeatingRbf(y + 0.53, 16, 0.3)),
      modFreq:
        0.5 * (repeatingRbf(x + 0.3, 14, 0.3) + repeatingRbf(y, 17, 0.4)),
      filterCutoff:
        Math.cos(3.8 * Math.PI * (1.2 * x + 0.9 * y + 0.3 * x * y)) * 0.5 + 0.5,
    };
  }

  setParams(x, y) {
    super.setParam("x", x);
    super.setParam("y", y);

    const { modGain, modFreq, filterCutoff } = ExperimentSynth.getParams(x, y);
    this.modulationGain.gain.linearRampToValueAtTime(
      modGain,
      this.context.currentTime + 0.1
    );
    this.modulator.frequency.linearRampToValueAtTime(
      modFreq * 500.0,
      this.context.currentTime + 0.1
    );
    this.filterA.frequency.linearRampToValueAtTime(
      Math.pow(filterCutoff, 1.5) * 8000 + 100,
      this.context.currentTime + 0.1
    );
  }

  async initialiseSynth() {
    await super.initialiseSynth();
    this.audioStarted = false;
    this.synth.disconnect(this.context.destination);

    const irResponse = await fetch("audio/ir.wav");
    const irBuffer = await irResponse.arrayBuffer();
    const irAudioBuffer = await this.context.decodeAudioData(irBuffer);
    this.convolution = this.context.createConvolver();
    this.convolution.buffer = irAudioBuffer;

    this.modulator = new OscillatorNode(this.context);
    this.modulator.start();
    this.modulator.frequency.value = 1000;
    this.modulationGain = new GainNode(this.context);
    this.modulationGain.gain.value = 0.3;
    this.modulator.connect(this.modulationGain);
    this.amSynth = new GainNode(this.context);
    this.modulationGain.connect(this.amSynth.gain);
    this.synth.connect(this.amSynth);

    this.filterA = new BiquadFilterNode(this.context);
    this.filterA.type = "bandpass";
    this.filterA.Q.value = 1 / 2;
    this.amSynth.connect(this.filterA);
    this.filterOut = new GainNode(this.context);
    this.filterA.connect(this.filterOut);

    this.wetGain = new GainNode(this.context);
    this.wetGain.value = 0.25;
    this.dryGain = new GainNode(this.context);
    this.dryGain.value = 0.75;

    this.masterGain = new GainNode(this.context);
    this.masterGain.value = 0.6;
    this.masterGain.connect(this.context.destination);

    this.filterOut
      .connect(this.convolution)
      .connect(this.wetGain)
      .connect(this.masterGain);
    this.filterOut.connect(this.dryGain).connect(this.masterGain);

    this.audioStarted = true;
  }
}

class SynthComponent extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      synth: new ExperimentSynth(),
    };
  }

  isInitialised() {
    return this.state.synth.isInitialised();
  }

  async startAudio() {
    await this.state.synth.initialiseSynth();
  }

  render() {
    return null;
  }
}

export { Synth, LookupTableSynth, ExperimentSynth, SynthComponent };
