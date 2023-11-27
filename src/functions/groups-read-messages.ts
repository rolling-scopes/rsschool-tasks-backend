import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "eu-central-1" });

export const handler = async (event) => {
  console.log("-event", event);
  const userEmail = event.headers["rs-email"];
  const userID = event.headers["rs-uid"];
  const userTokenRaw =
    event.headers["Authorization"] ?? event.headers["authorization"];
  const contentType =
    event.headers["content-type"] ?? event.headers["Content-Type"];

  if (!(userEmail && userID && userTokenRaw)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "InvalidUserDataException",
        message:
          'Header should contain "rs-email", "rs-uid" and "Authorization" parameters.',
      }),
    };
  }

  const userToken = /^Bearer\s+(\S+)$/.exec(userTokenRaw)?.[1];
  console.log("-token", userEmail, userTokenRaw, userToken);
  if (!userToken) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "InvalidTokenException",
        message:
          'Header should contain "Authorization" parameter with Bearer code.',
      }),
    };
  }

  const groupID = event.queryStringParameters?.groupID;
  const since = event.queryStringParameters?.since;

  if (!groupID) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "InvalidFormDataException",
        message: '"groupID" parameter should be in query list.',
      }),
    };
  }
  console.log("-conversation", groupID, since);

  let input = {
    TableName: `group-${groupID}`,
    ProjectionExpression: "#A, #M, #C",
    ExpressionAttributeNames: {
      "#A": "authorID",
      "#C": "createdAt",
      "#M": "message",
    },
  };

  if (since) {
    input = {
      ...input,
      FilterExpression: "#C > :since",
      ExpressionAttributeValues: {
        ":since": {
          S: since,
        },
      },
    };
  }

  const command = new ScanCommand(input);

  try {
    const result = await client.send(command);

    console.log("-result", result);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          type: "InvalidIDException",
          message: `Group with id "${groupID}" does not exist or was deleted before.`,
        }),
      };
    }

    throw err;
  }
};
