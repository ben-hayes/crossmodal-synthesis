import React from "react";
// import ReactDOM from "react-dom";
import { instanceOf } from "prop-types";
import { withCookies, Cookies } from "react-cookie";

import {
  ClassifierPage,
  DonePage,
  Experiment,
  HeatmapViewer,
  Welcome,
} from "./pages";
import { ExperimentSynth } from "./synth";
import { LoadingScreen, Modal, MultiStageModal } from "./ui";
import { makeUserId, randomSubset } from "./utils";

class App extends React.Component {
  static State = {
    LOADING: "loading",
    WELCOME: "welcome",
    EXPERIMENT: "experiment",
    DONE: "done",
    EXPLORER: "explorer",
    CLASSIFIER: "classifier",
  };

  static propTypes = {
    cookies: instanceOf(Cookies).isRequired,
  };

  constructor(props) {
    super(props);

    const { cookies } = props;
    let cookiesAgreed = false;
    let cookieExistedOnPageLoad = false;
    let dataAgreed = false;
    const userId = cookies.get("user_id");
    if (userId) {
      dataAgreed = cookies.get("data_agreed") === "true";
      console.log(dataAgreed);
      cookiesAgreed = true;
      cookieExistedOnPageLoad = true;
    }

    this.state = {
      userId,
      cookieExistedOnPageLoad,
      cookiesAgreed,
      dataAgreed,
      appState: App.State.LOADING,
      showingExplanation: false,
      completedTrialCoords: [],
    };
  }

  componentDidMount() {
    this.fetchResources();
  }

  async storeResponse(response) {
    this.setState({
      completedTrialCoords: this.state.completedTrialCoords.concat([response]),
    });

    if (this.state.dataAgreed) {
      response.userId = this.state.userId;
      const requestOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(response),
      };
      await fetch("/api/store-response", requestOptions);
      console.log("Stored response");
    }
  }

  async _fetchPreviousResponses() {
    const rawData = await fetch("/api/experiment-data");
    const { prompts, responses } = await rawData.json();
    const previousResponses = {};
    for (let response of responses) {
      if (!(response.prompt in previousResponses)) {
        previousResponses[response.prompt] = [];
      }
      previousResponses[response.prompt].push({ x: response.x, y: response.y });
    }
    return { prompts, previousResponses };
  }

  async fetchResources() {
    const { prompts, previousResponses } = await this._fetchPreviousResponses();

    const synthResources = await ExperimentSynth.loadResources(
      "waveshaper_grid.npy",
      "audio/ir.wav"
    );
    const synth = new ExperimentSynth(
      synthResources.lookupTable,
      synthResources.impulseResponse
    );
    await synth.initialiseSynth();

    this.setState({
      appState: App.State.WELCOME,
      prompts,
      previousResponses,
      synth,
    });
  }

  get combinedData() {
    if (!this.state.completedTrialCoords) {
      return this.state.previousResponses;
    } else {
      const combinedData = { ...this.state.previousResponses };
      for (let response of this.state.completedTrialCoords) {
        if (!(response.prompt in combinedData)) {
          combinedData[response.prompt] = [];
        }
        combinedData[response.prompt] =
          combinedData[response.prompt].concat(response);
      }
      return combinedData;
    }
  }

  setCookie(name, value) {
    const { cookies } = this.props;
    cookies.set(name, value);
  }

  get cookieDialog() {
    return this.state.cookieExistedOnPageLoad ? null : (
      <MultiStageModal
        modals={[
          {
            title: "Can we use cookies?",
            content: (
              <div>
                <p>
                  We'd love to be able to remember you next time you visit. To
                  do so, we'd like to use a single cookie which contains an
                  anonymous identifier.
                </p>
                <p>
                  We don't collect any personal information, and we don't share
                  your responses with third parties. If you choose not to use
                  cookies, that's fine too. You're still free to use the page,
                  but we won't be able to remember you when you return.
                </p>
              </div>
            ),
            buttons: [
              {
                text: "That's fine!",
                type: "next",
                onClick: () => {
                  const userId = makeUserId();
                  this.setCookie("user_id", userId);
                  this.setState({ cookiesAgreed: true, userId });
                },
              },
              {
                text: "No thanks",
                type: "okay",
                onClick: () => {
                  this.setState({ cookiesAgreed: false });
                },
              },
            ],
          },
          {
            title: "One more thing...",
            content: (
              <div>
                <p>
                  This page is part of a research project by{" "}
                  <a
                    href="https://benhayes.net/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ben Hayes
                  </a>
                  ,{" "}
                  <a
                    href="http://eecs.qmul.ac.uk/profiles/saitischaralampos.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Charalampos Saitis
                  </a>
                  , and{" "}
                  <a href="http://www.eecs.qmul.ac.uk/~gyorgyf/about.html">
                    György Fazekas
                  </a>{" "}
                  at Queen Mary University of London. The research is looking at
                  the associations between words and sound. We'd love to use the
                  responses you give in our research, and so we'd like to ask
                  your consent.
                </p>
                <p>
                  We'd like to save the sounds you create while on this page and
                  use these to study the sorts of sounds created in response to
                  different prompts. Any data we collect will be completely
                  anonymous and used only for research and teaching purposes.
                </p>
                <p>
                  By agreeing, you confirm you are at least 18 years of age and
                  consent to participating in our research. If you are under 18
                  or simply would rather not take part in the research, simply
                  select "I do not consent". You will still be able to use the
                  site, but your data will not be used in our research.
                </p>
              </div>
            ),
            buttons: [
              {
                text: "I consent",
                type: "okay",
                onClick: () => {
                  if (this.state.cookiesAgreed) {
                    this.setCookie("data_agreed", true);
                  }
                  this.setState({ dataAgreed: true });
                },
              },
              {
                text: "I do not consent",
                type: "okay",
                onClick: () => {
                  if (this.state.cookiesAgreed) {
                    this.setCookie("data_agreed", false);
                  }
                  this.setState({ dataAgreed: false });
                },
              },
            ],
          },
        ]}
      />
    );
  }

  get explanationDialog() {
    return this.state.showingExplanation ? (
      <Modal
        buttons={[
          {
            text: "Okay",
            onClick: () =>
              this.setState({
                showingExplanation: !this.state.showingExplanation,
              }),
          },
        ]}
        title="What is going on?"
      >
        <p>
          We are exploring the associations between{" "}
          <a
            target="_blank"
            href="https://en.wikipedia.org/wiki/Timbre"
            rel="noreferrer"
          >
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
            rel="noreferrer"
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
  }

  render() {
    let content;
    switch (this.state.appState) {
      case App.State.LOADING:
        content = <LoadingScreen />;
        break;

      case App.State.WELCOME:
        content = (
          <Welcome
            cookieExistedOnPageLoad={this.state.cookieExistedOnPageLoad}
            dataAgreed={this.state.dataAgreed}
            readyClicked={() => {
              this.setState({ appState: App.State.EXPERIMENT });
            }}
          />
        );
        break;

      case App.State.EXPERIMENT:
        const trialPrompts = randomSubset(this.state.prompts, 5);
        content = (
          <Experiment
            storeResponse={(response) => {
              this.storeResponse(response);
            }}
            prompts={trialPrompts}
            onDone={(data) => {
              this.setState({
                appState: App.State.DONE,
                // completedTrialCoords: data,
              });
            }}
            synth={this.state.synth}
          />
        );
        break;

      case App.State.DONE:
        let numSounds = 0;
        const data = this.combinedData;
        for (let key in data) {
          numSounds += data[key].length;
        }

        content = (
          <DonePage
            makeMoreSounds={() =>
              this.setState({ appState: App.State.EXPERIMENT })
            }
            exploreResponses={() =>
              this.setState({ appState: App.State.EXPLORER })
            }
            useClassifier={() =>
              this.setState({ appState: App.State.CLASSIFIER })
            }
            tooFewSounds={numSounds < 100}
          />
        );
        break;

      case App.State.EXPLORER:
        content = (
          <HeatmapViewer
            heatmapData={this.combinedData}
            prompts={this.state.prompts}
            onBackClick={() => this.setState({ appState: App.State.DONE })}
            synth={this.state.synth}
          />
        );
        break;

      case App.State.CLASSIFIER:
        content = (
          <ClassifierPage
            heatmapData={this.combinedData}
            prompts={this.state.prompts}
            onBackClick={() => this.setState({ appState: App.State.DONE })}
            synth={this.state.synth}
          />
        );
        break;

      default:
        content = null;
    }
    return (
      <div className="main-panel">
        <div className="content">{content}</div>
        {this.cookieDialog}
        {this.explanationDialog}
        <div id="credits">
          <span id="credits-left">
            <a
              href="/#"
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
            <a target="_blank" rel="noreferrer" href="https://benhayes.net/">
              Ben Hayes
            </a>
            .
          </span>
        </div>
      </div>
    );
  }
}

export default withCookies(App);
