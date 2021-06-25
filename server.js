const express = require("express");
const fs = require("fs");
const { MongoClient } = require("mongodb");
const path = require("path");
const bodyParser = require("body-parser");

const jsonParser = bodyParser.json();

let dbName;
const collectionName = "responses";
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
  dbName = "experiment-data-dev";
} else {
  dbName = "experiment-data-prod";
}

async function getPreviousResponses() {
  const client = new MongoClient(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await client.connect();
  const db = client.db(dbName);
  const collection = db.collection(collectionName);
  const responses = await collection.find({}).toArray();
  client.close();
  return responses;
}

async function storeResponse(response) {
  const client = new MongoClient(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await client.connect();
  const db = client.db(dbName);
  const collection = db.collection(collectionName);
  await collection.insertOne(response);
  client.close();
}

const app = express();
app.use(express.static(path.join(__dirname, "build")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

app.get("/api/experiment-data", (req, res) => {
  const promptsRaw = fs.readFileSync("prompts.json");
  const prompts = JSON.parse(promptsRaw);

  getPreviousResponses().then((responses) => {
    res.send({ prompts, responses });
  });

  return;
});

app.post("/api/store-response", jsonParser, (req, res) => {
  console.log("Storing response:");
  console.log(req.body);
  storeResponse(req.body).then(() => {
    res.end("Response successfully stored");
  });
});

app.listen(8080);
