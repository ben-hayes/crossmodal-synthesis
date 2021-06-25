import ndarray from "ndarray";
import npyjs from "npyjs";
import React from "react";

import { noteToFreq } from "./utils";

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

  closeContext() {
    this.context.close();
  }
}

class LookupTableSynth extends Synth {
  constructor(processorName, processorFile, lookupTable) {
    super(processorName, processorFile, {});
    this.npyArray = lookupTable;
  }

  static async _blockingLoadNpy(filename) {
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
    return ndarray(output.data, output.shape);
  }

  async initialiseSynth() {
    this.processorOptions = {
      npyArray: this.npyArray,
    };
    await super.initialiseSynth();
  }
}

class ExperimentSynth extends LookupTableSynth {
  constructor(lookupTable, impulseResponse) {
    super("wavetable_processor", "wavetable_processor.js", lookupTable);
    this.impulseResponse = impulseResponse;
  }

  static async loadResources(lookupTableFile, irFile) {
    const lookupTable = await LookupTableSynth._blockingLoadNpy(
      lookupTableFile
    );
    const impulseResponseStream = await fetch(irFile);
    const impulseResponse = await impulseResponseStream.arrayBuffer();
    return { lookupTable, impulseResponse };
  }

  static getParams(x, y) {
    return {
      x,
      y,
      // modGain:
      //   0.5 * (repeatingRbf(x + 0, 18, 0.6) + repeatingRbf(y + 0, 17, 0.5)),
      // modFreq:
      //   0.5 * (repeatingRbf(x + 0, 17.5, 0.7) + repeatingRbf(y, 18.5, 0.5)),
      modGain: Math.pow(
        Math.cos(2.9 * Math.PI * (1.4 * x + 0.6 * y + 0.1 * x * y)) * 0.5 + 0.5,
        2
      ),
      modFreq: Math.pow(
        Math.cos(4.2 * Math.PI * (0.6 * x + 1.3 * y + 0.2 * x * y)) * 0.5 + 0.5,
        2
      ),
      filterCutoff: Math.pow(
        Math.cos(3.8 * Math.PI * (1.2 * x + 0.9 * y + 0.3 * x * y)) * 0.5 + 0.5,
        2
      ),
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
      150 + modFreq * 450.0,
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

    const irAudioBuffer = await this.context.decodeAudioData(
      this.impulseResponse.slice(0)
    );
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
    this.filterA.frequency.value = 1000.0;
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
