import React from "react";
import ReactDOM from "react-dom";

import XyController from "./xy_controller";
import { ExperimentSynth } from "./synth";
import { randomSubset, sleep } from "./utils";
import { KnnClassifier, NeuralNetworkClassifier } from "./classifier";

function BackButton(props) {
  return (
    <a href="#" onClick={props.onClick}>
      <div className="back-button">← Back</div>
    </a>
  );
}

class SynthesiserPad extends React.Component {
  constructor(props) {
    super(props);
    this.state = {};
    this.synth = new ExperimentSynth();
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
          if (!this.synth.isInitialised()) {
            this.synth.initialiseSynth().then(() => {
              this.synth.noteOn(41);
              if (this.state.storedParams) {
                this.synth.setParams(...this.state.storedParams);
              }
            });
          } else {
            this.synth.noteOn(41);
          }
        }}
        noteOffCallback={() => {
          if (this.synth.isInitialised()) {
            this.synth.noteOff();
          }
        }}
        posChangeCallback={(x, y) => {
          x = x / 640;
          y = y / 480;
          if (this.synth.isInitialised()) {
            this.synth.setParams(x, y);
          } else {
            this.setState({
              storedParams: [x, y],
            });
          }
          if (this.props.posChangeCallback) {
            this.props.posChangeCallback({ x, y });
          }
        }}
      />
    );
  }
}

class Trial extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      coords: {},
    };
    this.synth = new ExperimentSynth();
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
          posChangeCallback={(coords) => this.setState({ coords })}
        />
        <div className="controls">
          <button
            className="nextButton"
            onClick={() => this.props.onComplete(this.state.coords)}
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
    this.synth = new ExperimentSynth();
  }

  get heatmapData() {
    if (this.state.currentPrompt) {
      const promptData = this.props.heatmapData[this.state.currentPrompt];
      const heatmapData = [];
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

const ClassifierState = {
  PRE_TRAINING: "pre_training",
  TRAINING: "training",
  INFERENCE: "inference",
};

class ClassifierPage extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      classifierState: ClassifierState.PRE_TRAINING,
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
    await this.setState({ classifierState: ClassifierState.TRAINING });
    await sleep(100);
    const { inputData, labels } = this._makeData();
    await this.classifier.train(
      inputData,
      labels,
      async (progress) => {
        // await sleep(10);
        this.setState({ progress });
      },
      () => this.setState({ classifierState: ClassifierState.INFERENCE })
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
          okayClicked={() => this.setState({ showingExplanation: false })}
          title="How does this work?"
        >
          <p>
            We are using an algorithm called{" "}
            <em>
              <a
                href="https://en.wikipedia.org/wiki/K-nearest_neighbors_algorithm"
                target="_blank"
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
      case ClassifierState.PRE_TRAINING:
        content = (
          <div className="viewerExplanation">
            <h2>
              Why not train a{" "}
              <a
                target="_blank"
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
      case ClassifierState.TRAINING:
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
      case ClassifierState.INFERENCE:
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
            />
            <div className="viewerExplanation">
              <h3>
                Explore the space above to see how the classifier labels the
                sound.
              </h3>
              <h4>
                The size of the text indicates the classifier's confidence.{" "}
                <a
                  href="#"
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

  trialComplete(coords) {
    const trialCoords = {};
    trialCoords[this.props.prompts[this.state.currentPromptIndex]] = coords;
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
        onComplete={(coords) => this.trialComplete(coords)}
      />
    );
  }
}

function DonePage(props) {
  return (
    <div className="viewerExplanation">
      <h2>Thank you!</h2>
      <h3>Now that you've created some sounds. What would you like to do?</h3>
      <div className="options">
        <a href="#" onClick={props.makeMoreSounds}>
          <div className="option">Make more sounds.</div>
        </a>
        <a href="#" onClick={props.exploreResponses}>
          <div className="option">Explore other people's responses.</div>
        </a>
        <a href="#" onClick={props.useClassifier}>
          <div className="option">Use machine learning to describe sounds.</div>
        </a>
      </div>
    </div>
  );
}

function LoadingScreen(props) {
  return <h2>Loading...</h2>;
}

function Modal(props) {
  return (
    <div className="modal">
      <div className="modal-dialog">
        <div className="model-content">
          <h2>{props.title}</h2>
          <div className="modal-text">{props.children}</div>

          <button onClick={props.okayClicked} className="hoverButton">
            Okay
          </button>
        </div>
      </div>
    </div>
  );
}

const AppState = {
  LOADING: "loading",
  WELCOME: "welcome",
  EXPERIMENT: "experiment",
  DONE: "done",
  EXPLORER: "explorer",
  CLASSIFIER: "classifier",
};

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      appState: AppState.LOADING,
      showingExplanation: false,
      completedTrialCoords: null,
    };
  }

  componentDidMount() {
    this.fetchResources();
  }

  async fetchResources() {
    const fakePrompts = [
      "sharp",
      "metallic",
      "bright",
      "harsh",
      "big",
      "thick",
      "deep",
      "thin",
      "clean",
      "clear",
      "raw",
      "rich",
      "dull",
      "mellow",
      "woody",
      "warm",
      "dark",
      "aggressive",
      "sweet",
      "noisy",
      "hard",
      "smooth",
      "complex",
      "gritty",
      "rough",
    ];

    const fakeResponses = {};
    for (let prompt of fakePrompts) {
      const numHotspots = Math.ceil(Math.random() * 2);
      const dummyData = [];
      for (let i = 0; i < numHotspots; i++) {
        const xHotspot = Math.random();
        const yHotspot = Math.random();
        const numPoints = Math.floor(50 / numHotspots);
        for (let i = 0; i < numPoints; i++) {
          dummyData.push({
            x:
              xHotspot +
              ((numPoints - i) / numPoints) * 0.4 * (Math.random() - 0.5),
            y:
              yHotspot +
              ((numPoints - i) / numPoints) * 0.4 * (Math.random() - 0.5),
          });
        }
      }
      fakeResponses[prompt] = dummyData;
    }

    this.setState({
      appState: AppState.EXPERIMENT,
      prompts: fakePrompts,
      previousResponses: fakeResponses,
    });
  }

  get combinedData() {
    if (!this.state.completedTrialCoords) {
      return this.state.previousResponses;
    } else {
      const combinedData = { ...this.state.previousResponses };
      for (let prompt in this.state.completedTrialCoords) {
        combinedData[prompt] = combinedData[prompt].concat(
          this.state.completedTrialCoords[prompt]
        );
      }
      return combinedData;
    }
  }

  render() {
    let content;
    switch (this.state.appState) {
      case AppState.LOADING:
        content = <LoadingScreen />;
        break;

      case AppState.EXPERIMENT:
        const trialPrompts = randomSubset(this.state.prompts, 5);
        content = (
          <Experiment
            prompts={trialPrompts}
            onDone={(data) => {
              this.setState({
                appState: AppState.DONE,
                completedTrialCoords: data,
              });
            }}
          />
        );
        break;

      case AppState.DONE:
        content = (
          <DonePage
            makeMoreSounds={() =>
              this.setState({ appState: AppState.EXPERIMENT })
            }
            exploreResponses={() =>
              this.setState({ appState: AppState.EXPLORER })
            }
            useClassifier={() =>
              this.setState({ appState: AppState.CLASSIFIER })
            }
          />
        );
        break;

      case AppState.EXPLORER:
        content = (
          <HeatmapViewer
            heatmapData={this.combinedData}
            prompts={this.state.prompts}
            onBackClick={() => this.setState({ appState: AppState.DONE })}
          />
        );
        break;

      case AppState.CLASSIFIER:
        content = (
          <ClassifierPage
            heatmapData={this.combinedData}
            prompts={this.state.prompts}
            onBackClick={() => this.setState({ appState: AppState.DONE })}
          />
        );
        break;

      default:
        content = null;
    }
    const dialog = this.state.showingExplanation ? (
      <Modal
        okayClicked={() =>
          this.setState({
            showingExplanation: !this.state.showingExplanation,
          })
        }
        title="What is going on?"
      >
        <p>
          We are exploring the associations between{" "}
          <a target="_blank" href="https://en.wikipedia.org/wiki/Timbre">
            musical timbre
          </a>{" "}
          and words in our language.
        </p>
        <p>
          You can help us by creating sounds on this page. Simply drag the black
          square around the space to explore the sounds it contains. When you
          find one that matches the given prompt, submit it!
        </p>
        <p>
          Once you have submitted a few sounds, you can explore the responses of
          others who have taken part. Do you agree with the sounds they created
          to match the prompts?
        </p>
        <p>
          You can also try interacting with a{" "}
          <a
            target="_blank"
            href="https://simple.wikipedia.org/wiki/Supervised_learning"
          >
            classifier
          </a>{" "}
          trained on all these responses, including your own! It will try to
          describe the sounds you create as you explore the space. As more
          people interact, it will continue to learn to predict appropriate
          descriptions.
        </p>
      </Modal>
    ) : null;
    return (
      <div className="main-panel">
        <div className="content">{content}</div>
        {dialog}
        <div id="credits">
          <span id="credits-left">
            <a
              href="#"
              onClick={() => {
                this.setState({ showingExplanation: true });
              }}
            >
              {" "}
              What is this?
            </a>
          </span>
          <span id="credits-right">
            Created by{" "}
            <a target="_blank" href="https://benhayes.net/">
              Ben Hayes
            </a>
            .
          </span>
        </div>
      </div>
    );
  }
}

export default App;
