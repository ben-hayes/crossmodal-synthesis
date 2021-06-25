import React, { useState } from "react";

import { KnnClassifier } from "./classifier";
import { ExperimentSynth } from "./synth";
import { BackButton, SynthesiserPad, Modal } from "./ui";
import { sleep } from "./utils";

function Welcome(props) {
  const [page, setPage] = useState(0);
  const welcomeText = props.cookieExistedOnPageLoad
    ? "Welcome back!"
    : "Welcome!";
  const dataText = props.dataAgreed
    ? "You said you're willing for us to use your responses in our research, so thank you! The sounds you create will help us to learn more about how we perceive sound, and the relationships between sound and language."
    : "You said you'd prefer us not to use your responses in our research. That's absolutely fine and you're still perfectly welcome to use this page — we simply won't record your responses.";

  const pages = [
    <div>
      <h2>{welcomeText} 🧪👂🎹</h2>
      <p>
        On the following screens you'll be invited to create sounds in response
        to descriptive prompts. Sound complicated? Don't worry! We've made it
        super easy for you.
      </p>
    </div>,
    <div>
      <h2>How does it work? 🤔</h2>
      <p>
        On each screen, you'll be presented with a rectangular control space
        containing a black square. All you need to do is click and drag the
        black square around the space. When your mouse is held down the sound
        will play, and as you move the square the sound will change. It's as
        simple as that! Once you've found a sound you think matches the prompt,
        simply click the button below the control to move on.
      </p>
    </div>,
    <div>
      <h2>A couple of tips... ☝🧑‍🏫️</h2>
      <p>
        There are a lot of different sounds hidden in the space, so we suggest
        moving the square slowly over small distances to hear all the
        variations. If a particular region of the space doesn't seem to be
        working out, just click somewhere else and start exploring there
        instead. The differences between sounds can be quite subtle, so we
        recommend using headphones for the best experience.
      </p>
    </div>,
    <div>
      <h2>One last thing... ✔️</h2>
      <p>
        {dataText} Once you're done, you can explore the sounds others created
        in response to the prompts, and even use machine learning to see how the
        computer interprets sounds in the space. Ready to go?
      </p>
    </div>,
  ];
  const readyButton = (
    <button onClick={props.readyClicked} className="nextButton">
      I'm ready!
    </button>
  );
  const nextButton = (
    <button onClick={() => setPage(page + 1)} className="nextButton">
      Next
    </button>
  );
  return (
    <div className="trial">
      <div className="viewerExplanation">
        {pages[page]}
        {page === pages.length - 1 ? readyButton : nextButton}
      </div>
    </div>
  );
}

class Trial extends React.Component {
  constructor(props) {
    super(props);
    this.startTime = new Date().getTime();

    this.state = {
      coords: { x: 0, y: 0 },
      coordHistory: [],
    };
  }

  padPositionChanged(coords) {
    const coordHistory = this.state.coordHistory.concat({
      x: coords.x,
      y: coords.y,
      time: new Date().getTime() - this.startTime,
    });
    this.setState({ coords, coordHistory });
  }

  render() {
    const determiner =
      "aeiou".indexOf(this.props.prompt[0]) === -1 ? "a" : "an";

    return (
      <div className="trial">
        <h2>
          Explore the space below to create {determiner}{" "}
          <em className="prompt">{this.props.prompt}</em> sound.
        </h2>
        <SynthesiserPad
          posChangeCallback={(coords) => this.padPositionChanged(coords)}
          synth={this.props.synth}
        />
        <div className="controls">
          <button
            className="nextButton"
            onClick={() => {
              this.props.onComplete(this.state.coords, this.state.coordHistory);
              this.setState({ coordHistory: [] });
            }}
          >
            I'm done
          </button>
        </div>
      </div>
    );
  }
}

class HeatmapViewer extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      currentPrompt: null,
    };
  }

  get heatmapData() {
    if (
      this.state.currentPrompt &&
      this.state.currentPrompt in this.props.heatmapData
    ) {
      const heatmapData = [];
      const promptData = this.props.heatmapData[this.state.currentPrompt];
      for (let sample of promptData) {
        heatmapData.push({
          x: Math.round(sample.x * 640),
          y: Math.round(sample.y * 480),
          value: 1,
        });
      }
      return heatmapData;
    } else {
      return [];
    }
  }

  promptClicked(prompt) {
    if (this.state.currentPrompt !== prompt) {
      this.setState({ currentPrompt: prompt });
    } else {
      this.setState({ currentPrompt: null });
    }
  }

  render() {
    const promptButtons = [];
    for (let prompt of this.props.prompts) {
      promptButtons.push(
        <button
          key={prompt}
          onClick={() => this.promptClicked(prompt)}
          className={
            this.state.currentPrompt === prompt
              ? "hoverButton selected"
              : "hoverButton"
          }
        >
          {prompt}
        </button>
      );
    }

    return (
      <div className="trial">
        <BackButton onClick={this.props.onBackClick} />
        <div className="viewerControls">{promptButtons}</div>
        <SynthesiserPad
          posChangeCallback={(coords) => this.setState({ coords })}
          heatmapData={this.heatmapData}
          synth={this.props.synth}
        />
        <div className="viewerExplanation">
          <h3>
            Try clicking the prompts above to visualise everyone's responses.
          </h3>
        </div>
      </div>
    );
  }
}

class ClassifierPage extends React.Component {
  static State = {
    PRE_TRAINING: "pre_training",
    TRAINING: "training",
    INFERENCE: "inference",
  };

  constructor(props) {
    super(props);
    this.state = {
      classifierState: ClassifierPage.State.PRE_TRAINING,
      labelPrompts: [],
      progress: 0,
      acc: 0,
      showingExplanation: false,
    };
    this.classifier = new KnnClassifier(this.props.prompts.length);
    // this.classifier = new NeuralNetworkClassifier(
    //   5,
    //   32,
    //   this.props.prompts.length,
    //   this.props.learnRate
    // );
  }

  static defaultProps = {
    batchSize: 512,
    epochs: 150,
    learnRate: 0.001,
  };

  _makeData() {
    const inputData = [];
    const labels = [];
    for (let prompt in this.props.heatmapData) {
      for (let response of this.props.heatmapData[prompt]) {
        const { x, y, modGain, modFreq, filterCutoff } =
          ExperimentSynth.getParams(response.x, response.y);
        inputData.push([x, y, modGain, modFreq, filterCutoff]);
        labels.push([this.props.prompts.indexOf(prompt)]);
      }
    }
    return { inputData, labels };
  }

  async _doInference(coords) {
    const { x, y, modGain, modFreq, filterCutoff } = ExperimentSynth.getParams(
      coords.x,
      coords.y
    );
    const inputData = [[x, y, modGain, modFreq, filterCutoff]];
    const { indicesArr, valuesArr } = await this.classifier.predict(
      inputData,
      this.props.prompts.length
    );
    const labelPrompts = [];
    for (let i = 0; i < indicesArr.length; i++) {
      labelPrompts.push({
        prompt: this.props.prompts[indicesArr[i]],
        probability: valuesArr[i],
      });
    }
    this.setState({ labelPrompts });
  }

  async _train() {
    await this.setState({ classifierState: ClassifierPage.State.TRAINING });
    await sleep(100);
    const { inputData, labels } = this._makeData();
    await this.classifier.train(
      inputData,
      labels,
      async (progress) => {
        // await sleep(10);
        this.setState({ progress });
      },
      () => this.setState({ classifierState: ClassifierPage.State.INFERENCE })
    );
    // await this.classifier.train(
    //   inputData,
    //   labels,
    //   this.props.epochs,
    //   this.props.batchSize,
    //   {
    //     onEpochEnd: (epoch, logs) => {
    //       this.setState({ epoch, loss: logs.loss, acc: logs.acc });
    //     },
    //     onTrainEnd: (logs) => {
    //       this.setState({ classifierState: ClassifierState.INFERENCE });
    //     },
    //   }
    // );
  }

  render() {
    let content = null;
    let explanation = null;
    if (this.state.showingExplanation) {
      explanation = (
        <Modal
          title="How does this work?"
          buttons={[
            {
              text: "Okay",
              onClick: () =>
                this.setState({
                  showingExplanation: !this.state.showingExplanation,
                }),
            },
          ]}
        >
          <p>
            We are using an algorithm called{" "}
            <em>
              <a
                href="https://en.wikipedia.org/wiki/K-nearest_neighbors_algorithm"
                target="_blank"
                rel="noreferrer"
              >
                k-nearest neighbours
              </a>
            </em>
            , or KNN. To find labels that describe a sound, we first look at the
            synthesis parameters used to create that sound. Then, we compare
            those to the parameters of all the sounds created by other
            participants. We assume that if the parameters used to create the
            sounds are similar, they their labels are also likely to be similar.
            Based on the difference in parameter values we can derive a
            confidence for each label, which dictates the size and order of the
            words you see changing as you move around the space.
          </p>
          <p>
            Do you agree with the algorithm's choices? Does it accurately
            capture the relationship between words and sound? We'd love to{" "}
            <a href="mailto:b.j.hayes@qmul.ac.uk">hear from you</a>!
          </p>
        </Modal>
      );
    }
    switch (this.state.classifierState) {
      case ClassifierPage.State.PRE_TRAINING:
        content = (
          <div className="viewerExplanation">
            <h2>
              Why not train a{" "}
              <a
                target="_blank"
                rel="noreferrer"
                href="https://simple.wikipedia.org/wiki/Supervised_learning"
              >
                classifier
              </a>
              ?
            </h2>
            <h4>
              The classifier will use machine learning to describe timbres based
              on the sounds created by you and everyone who has taken part.
            </h4>
            <h4>
              Training will take a few seconds. Simply click below to get
              started.
            </h4>
            <button
              ref="trainBtn"
              className="nextButton"
              onClick={() => this._train()}
            >
              Train!
            </button>
          </div>
        );
        break;
      case ClassifierPage.State.TRAINING:
        content = (
          <div>
            <h2>Training...</h2>
            <div className="loading-bar-outer">
              <div
                className="loading-bar-inner"
                style={{
                  width: 100 * this.state.progress + "%",
                }}
              ></div>
            </div>
            {/* <div className="loss">Accuracy: {this.state.acc.toFixed(2)}</div> */}
          </div>
        );
        break;
      case ClassifierPage.State.INFERENCE:
        const labels = [];
        for (let label of this.state.labelPrompts) {
          labels.push(
            <span
              key={label.prompt}
              style={{
                fontSize: Math.pow(label.probability, 0.8) * 100 + "pt",
              }}
            >
              {label.prompt}{" "}
            </span>
          );
        }
        content = (
          <div>
            <div className="predictions">
              <div className="prediction-text">{labels}</div>
            </div>
            <SynthesiserPad
              posChangeCallback={(coords) => this._doInference(coords)}
              synth={this.props.synth}
            />
            <div className="viewerExplanation">
              <h3>
                Explore the space above to see how the classifier labels the
                sound.
              </h3>
              <h4>
                The size of the text indicates the classifier's confidence.{" "}
                <a
                  href="/#"
                  onClick={() => this.setState({ showingExplanation: true })}
                >
                  How does this work?
                </a>
              </h4>
            </div>
            {explanation}
          </div>
        );
        break;
      default:
    }
    return (
      <div className="trial">
        <BackButton onClick={this.props.onBackClick} />
        {content}
      </div>
    );
  }
}

class Experiment extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      currentPromptIndex: 0,
      completedTrialCoords: {},
    };
  }

  trialComplete(coords, coordHistory) {
    const trialCoords = {};
    trialCoords[this.props.prompts[this.state.currentPromptIndex]] = coords;
    this.props.storeResponse({
      prompt: this.props.prompts[this.state.currentPromptIndex],
      x: coords.x,
      y: coords.y,
      coordHistory,
    });
    this.setState({
      completedTrialCoords: Object.assign(
        this.state.completedTrialCoords,
        trialCoords
      ),
    });
    if (this.state.currentPromptIndex < this.props.prompts.length - 1) {
      this.setState({
        currentPromptIndex: this.state.currentPromptIndex + 1,
      });
    } else {
      this.props.onDone(this.state.completedTrialCoords);
    }
  }

  render() {
    return (
      <Trial
        prompt={this.props.prompts[this.state.currentPromptIndex]}
        onComplete={(coords, coordHistory) =>
          this.trialComplete(coords, coordHistory)
        }
        synth={this.props.synth}
      />
    );
  }
}

function DonePage(props) {
  const warning = props.tooFewSounds ? (
    <div>
      <h3>Until more sounds are created, the next option is disabled.</h3>
      <h5>
        Come back soon to try it out! In the meantime, why not make more sounds
        to help unlock it sooner?
      </h5>
    </div>
  ) : null;
  return (
    <div className="viewerExplanation">
      <h2>Thank you!</h2>
      <h3>Now that you've created some sounds. What would you like to do?</h3>
      <div className="options">
        <a href="/#" onClick={props.makeMoreSounds}>
          <div className="option">Make more sounds.</div>
        </a>
        <a href="/#" onClick={props.exploreResponses}>
          <div className="option">Explore other people's responses.</div>
        </a>
        {warning}
        <a href="/#" onClick={props.tooFewSounds ? null : props.useClassifier}>
          <div className={props.tooFewSounds ? "option disabled" : "option"}>
            Describe sounds with machine learning.{" "}
          </div>
        </a>
      </div>
    </div>
  );
}

export { HeatmapViewer, ClassifierPage, Experiment, DonePage, Welcome };
