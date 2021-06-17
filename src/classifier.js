import * as tf from "@tensorflow/tfjs";
import * as knnClassifier from "@tensorflow-models/knn-classifier";

import { sleep } from "./utils";

class Classifier {
  constructor(numClasses) {
    this.numClasses = numClasses;
  }

  _notImplemented() {
    throw new Error("Not implemented");
  }

  async train(inputs, labels, stepCallback, doneCallback) {
    this._notImplemented();
  }

  async predict(inputs, topN) {
    this._notImplemented();
  }
}

class NeuralNetworkClassifier extends Classifier {
  constructor(inputSize, hiddenSize, outputSize, learningRate) {
    super(outputSize);
    this.model = this._createNetwork(
      inputSize,
      hiddenSize,
      outputSize,
      tf.regularizers.l1({ l1: 0.001 })
    );
    this.model.compile({
      loss: "categoricalCrossentropy",
      optimizer: tf.train.adam(learningRate),
      metrics: ["accuracy"],
    });
  }

  _createNetwork(inputSize, hiddenSize, outputSize, regularizer) {
    const model = new tf.sequential();
    model.add(
      tf.layers.dense({
        units: hiddenSize,
        inputShape: [inputSize],
        activation: "tanh",
        kernelRegularizer: regularizer,
      })
    );
    model.add(
      tf.layers.dense({
        units: hiddenSize,
        intputShape: [hiddenSize],
        activation: "tanh",
        kernelRegularizer: regularizer,
      })
    );
    model.add(
      tf.layers.dense({
        units: hiddenSize,
        intputShape: [hiddenSize],
        activation: "relu",
        kernelRegularizer: regularizer,
      })
    );
    model.add(
      tf.layers.dense({
        units: outputSize,
        inputShape: [hiddenSize],
        activation: "softmax",
        kernelRegularizer: regularizer,
      })
    );
    return model;
  }

  async train(inputs, labels, epochs, batchSize, callbacks) {
    const X = tf.tensor2d(inputs);
    const y = tf.squeeze(tf.oneHot(labels, this.numClasses));

    await this.model.fit(X, y, {
      batchSize,
      epochs,
      callbacks,
    });

    X.dispose();
    y.dispose();
  }

  async predict(inputs, topN = 1) {
    const result = this.model.predict(tf.tensor(inputs));
    const { indices, values } = tf.topk(result, topN);
    const indicesData = indices.dataSync();
    const valuesData = values.dataSync();
    const indicesArr = Array.from(indicesData);
    const valuesArr = Array.from(valuesData);
    return { indicesArr, valuesArr };
  }
}

class KnnClassifier extends Classifier {
  constructor(numClasses) {
    super(numClasses);
    this.model = knnClassifier.create();
  }

  async train(inputs, labels, stepCallback, doneCallback) {
    for (let i = 0; i < inputs.length; i++) {
      const input = tf.tensor(inputs[i]);
      const label = labels[i];
      this.model.addExample(input, label);
      stepCallback(i / inputs.length);

      // gruesome hack :(
      await sleep(0.001);
    }
    doneCallback();
  }

  async predict(inputs, topN = 1) {
    const result = await this.model.predictClass(tf.tensor(inputs), topN);
    const confidences = [];
    for (let idx in result.confidences) {
      confidences.push({ index: idx, confidence: result.confidences[idx] });
    }
    confidences.sort((a, b) =>
      a.confidence < b.confidence ? 1 : a.confidence === b.confidence ? 0 : -1
    );
    const indicesArr = [];
    const valuesArr = [];
    for (let confidence of confidences) {
      indicesArr.push(confidence.index);
      valuesArr.push(confidence.confidence);
    }
    return {
      indicesArr,
      valuesArr,
    };
  }
}

export { NeuralNetworkClassifier, KnnClassifier };
