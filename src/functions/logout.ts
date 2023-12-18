import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEventV2 } from "aws-lambda";

const client = new DynamoDBClient({ region: "eu-central-1" });

export const handler = async (event: APIGatewayProxyEventV2) => {
  console.log("-event", event);

  const userID = event.headers["rs-uid"];
  const userEmail = event.headers["rs-email"];
  const userTokenRaw =
    event.headers["Authorization"] ?? event.headers["authorization"];

  if (!(userID && userEmail && userTokenRaw)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "InvalidUserDataException",
        message:
          'Header should contain "rs-uid", "rs-email" and "Authorization" parameters.',
      }),
    };
  }

  const userToken = /^Bearer\s+(\S+)$/.exec(userTokenRaw)?.[1];
  console.log("-token", userID, userTokenRaw, userToken);
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

  const getCommand = new UpdateItemCommand({
    TableName: "rsschool-2023-users",
    Key: {
      email: {
        S: userEmail,
      },
    },
    ConditionExpression: "#T = :c AND #U = :u",
    UpdateExpression: "SET #T = :t",
    ExpressionAttributeNames: {
      "#T": "token",
      "#U": "uid",
    },
    ExpressionAttributeValues: {
      ":u": {
        S: userID,
      },
      ":t": {
        S: "",
      },
      ":c": {
        S: userToken,
      },
    },
  });

  try {
    await client.send(getCommand);

    return {
      statusCode: 200,
    };
  } catch (err) {
    console.log("-error", err);

    if ((err as Error).name === "ConditionalCheckFailedException") {
      return {
        statusCode: 401,
        body: JSON.stringify({
          type: "InvalidTokenException",
          message: "Current session token is not valid.",
        }),
      };
    }

    throw err;
  }
};
