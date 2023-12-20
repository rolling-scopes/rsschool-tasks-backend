import {DynamoDBClient, QueryCommand, ScanCommand} from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEventV2 } from "aws-lambda";

const client = new DynamoDBClient({ region: "eu-central-1" });

export const handler = async (event: APIGatewayProxyEventV2) => {
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



  const getCommand = new ScanCommand({
    TableName: "rsschool-2023-users",
    ExpressionAttributeNames: {
      "#U": "uid",
      "#N": "name",
    },
    ProjectionExpression: "#U, #N",
  });
  const result = await client.send(getCommand);

  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
};
