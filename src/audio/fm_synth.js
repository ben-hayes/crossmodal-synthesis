class FMSynthNode extends window.AudioWorkletNode {
    constructor(context) {
        super(context, 'fm_synth_processor');
    }
}

export default FMSynthNode;