import {
  DynamoDBClient,
  DeleteItemCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";

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

  if (!groupID) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "InvalidFormDataException",
        message: '"groupID" parameter should be in query list.',
      }),
    };
  }
  console.log("-conversation", groupID);

  const deleteItemCommand = new DeleteItemCommand({
    TableName: "rsschool-2023-groups",
    Key: {
      id: {
        S: groupID,
      },
    },
    ReturnValues: "NONE",
    ConditionExpression: "#CB = :uid",
    ExpressionAttributeNames: {
      "#CB": "createdBy",
    },
    ExpressionAttributeValues: {
      ":uid": {
        S: userID,
      },
    },
  });

  try {
    const result = await client.send(deleteItemCommand);

    console.log("-delete item", result);
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          type: "InvalidIDException",
          message: `Group with id "${groupID}" does not exist or was removed before.`,
        }),
      };
    }

    throw err;
  }

  const deleteTableCommand = new DeleteTableCommand({
    TableName: `group-${groupID}`,
  });

  try {
    const result = await client.send(deleteTableCommand);

    console.log("-delete table", result);
  } catch (err) {
    // do nothing
    console.log("-delete table", err);
  }

  return {
    statusCode: 200,
  };
};
