import {
  DynamoDBClient,
  DeleteItemCommand,
  DeleteTableCommand, QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEventV2 } from "aws-lambda";

const client = new DynamoDBClient({ region: "eu-central-1" });

export const handler = async (event: APIGatewayProxyEventV2) => {
  console.log("-event", event);
  const userEmail = event.headers["rs-email"];
  const userID = event.headers["rs-uid"];
  const userTokenRaw =
    event.headers["Authorization"] ?? event.headers["authorization"];

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




  // verify user's credentials
  const profileCommand = new QueryCommand({
    TableName: "rsschool-2023-users",
    ProjectionExpression: "#E, #CA, #N, #UID",
    ExpressionAttributeNames: {
      "#E": "email",
      "#CA": "createdAt",
      "#N": "name",
      "#UID": "uid",
      "#T": "token",
    },
    ExpressionAttributeValues: {
      ":email": {
        S: userEmail,
      },
      ":uid": {
        S: userID,
      },

      ":token": {
        S: userToken,
      },
    },
    KeyConditionExpression: "#E = :email",
    FilterExpression: "#T = :token AND #UID = :uid",
  });

  const profileResult = await client.send(profileCommand);

  if (profileResult.Count !== 1) {
    console.log("-profile result", profileResult);

    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "InvalidTokenException",
        message: "User was not found",
      }),
    };
  }



  const conversationID = event.queryStringParameters?.conversationID;

  if (!conversationID) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "InvalidFormDataException",
        message: '"conversationID" parameter should be in query list.',
      }),
    };
  }
  console.log("-conversation", conversationID);

  const deleteItemCommand = new DeleteItemCommand({
    TableName: "rsschool-2023-conversations",
    Key: {
      id: {
        S: conversationID,
      },
    },
    ReturnValues: "NONE",
    ConditionExpression: "#U1 = :uid OR #U2 = :uid",
    ExpressionAttributeNames: {
      "#U1": "user1",
      "#U2": "user2",
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
    if ((err as Error).name === "ConditionalCheckFailedException") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          type: "InvalidIDException",
          message: `Conversation with id "${conversationID}" does not exist or was removed before.`,
        }),
      };
    }

    throw err;
  }

  const deleteTableCommand = new DeleteTableCommand({
    TableName: `conversation-${conversationID}`,
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
