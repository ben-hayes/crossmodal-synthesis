import React from "react";

import XyController from "./xy_controller";

function BackButton(props) {
  return (
    <button className="back-button" onClick={props.onClick}>
      ← Back
    </button>
  );
}

function LoadingScreen(props) {
  return <h2>Loading...</h2>;
}

function Modal(props) {
  const buttons = [];
  for (let button of props.buttons) {
    buttons.push(
      <button
        onClick={button.onClick}
        className="hoverButton"
        key={button.text}
      >
        {button.text}
      </button>
    );
  }

  return (
    <div className="modal">
      <div className="modal-dialog">
        <div className="model-content">
          <h2>{props.title}</h2>
          <div className="modal-text">{props.children}</div>

          {buttons}
        </div>
      </div>
    </div>
  );
}

class MultiStageModal extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      stage: 0,
    };
  }

  render() {
    let dialog = null;
    if (this.state.stage < this.props.modals.length) {
      const currentModal = this.props.modals[this.state.stage];
      const buttons = currentModal.buttons.map((button) => {
        let onClick;
        if (button.type === "next") {
          onClick = () => {
            button.onClick();
            this.setState({ stage: this.state.stage + 1 });
          };
        } else if (button.type === "previous") {
          onClick = () => {
            button.onClick();
            this.setState({
              stage: this.state.stage > 0 ? this.state.stage - 1 : 0,
            });
          };
        } else {
          onClick = () => {
            button.onClick();
            this.setState({
              stage: this.props.modals.length,
            });
          };
        }
        return {
          text: button.text,
          onClick,
        };
      });
      dialog = (
        <Modal title={currentModal.title} buttons={buttons}>
          {currentModal.content}
        </Modal>
      );
    }
    return dialog;
  }
}

class SynthesiserPad extends React.Component {
  constructor(props) {
    super(props);
    this.state = {};
    this.synth = props.synth;
  }

  componentWillUnmount() {
    if (this.synth.isInitialised()) {
      this.synth.noteOff();
    }
  }

  render() {
    return (
      <XyController
        width={640}
        height={480}
        isHeatmap={this.props.heatmapData ? true : false}
        heatmapData={this.props.heatmapData ? this.props.heatmapData : null}
        noteOnCallback={() => {
          this.synth.noteOn(41);
        }}
        noteOffCallback={() => {
          this.synth.noteOff();
        }}
        posChangeCallback={(x, y) => {
          x = x / 640;
          y = y / 480;
          this.synth.setParams(x, y);
          if (this.props.posChangeCallback) {
            this.props.posChangeCallback({ x, y });
          }
        }}
      />
    );
  }
}

export { BackButton, LoadingScreen, Modal, MultiStageModal, SynthesiserPad };
