const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocument } = require('@aws-sdk/lib-dynamodb');

const getDynamoDBClient = function (config) {
  // TODO: abstract client / db setup out to a setup method
  return new DynamoDBClient(config);
}

const getDynamoDBInstance = function (client) {
  const marshallOptions = {
    // Whether to automatically convert empty strings, blobs, and sets to `null`.
    convertEmptyValues: false, // false, by default.
    // Whether to remove undefined values while marshalling.
    removeUndefinedValues: false, // false, by default.
    // Whether to convert typeof object to map attribute.
    convertClassInstanceToMap: false, // false, by default.
  };

  const unmarshallOptions = {
    // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
    wrapNumbers: false, // false, by default.
  };

  const translateConfig = { marshallOptions, unmarshallOptions };

  return DynamoDBDocument.from(client, translateConfig)
}

module.exports = {
  getDynamoDBClient,
  getDynamoDBInstance,
}