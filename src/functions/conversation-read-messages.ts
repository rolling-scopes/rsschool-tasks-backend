import {
  DynamoDBClient,
  ScanCommand,
  ScanCommandInput,
  GetItemCommand, QueryCommand,
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

  const conversationID = event.queryStringParameters?.conversationID;
  const since = event.queryStringParameters?.since;

  if (!conversationID) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "InvalidFormDataException",
        message: '"conversationID" parameter should be in query list.',
      }),
    };
  }
  console.log("-conversation", conversationID, since);



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

  const result = await client.send(profileCommand);

  if (result.Count !== 1) {
    console.log("-result", result);

    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "InvalidTokenException",
        message: "User was not found",
      }),
    };
  }



  let input: ScanCommandInput = {
    TableName: `conversation-${conversationID}`,
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
    if ((err as Error).name === "ResourceNotFoundException") {
      // new conversation could not be created so quickly
      const input = {
        TableName: "rsschool-2023-conversations",
        Key: {
          id: {
            S: conversationID,
          },
        },
      };

      const verifyCommand = new GetItemCommand(input);
      const result = await client.send(verifyCommand);

      console.log('-verify', result);

      if (result.Item) {
        return { statusCode: 200, body: JSON.stringify({Count: 0, ScannedCount: 0, Items: []}) };
      }

      return {
        statusCode: 400,
        body: JSON.stringify({
          type: "InvalidIDException",
          message: `Conversation with id "${conversationID}" does not exist or was deleted before.`,
        }),
      };
    } else if ((err as Error).name === 'ValidationException') {
      return { statusCode: 400, body: JSON.stringify({ type: 'InvalidFormDataException', message: 'Validation of "conversationID" parameter failed' }) };
    }

    throw err;
  }
};
