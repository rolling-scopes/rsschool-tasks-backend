import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
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

  const getCommand = new ScanCommand({
    TableName: "rsschool-2023-conversations",
    ExpressionAttributeNames: {
      "#ID": "id",
      "#U1": "user1",
      "#U2": "user2",
    },
    ExpressionAttributeValues: {
      ":uid": {
        S: userID,
      },
    },
    FilterExpression: "#U1 = :uid OR #U2 = :uid",
    ProjectionExpression: "#ID, #U1, #U2",
  });
  const result = await client.send(getCommand);

  const Items = result.Items.map((item) => ({
    id: item.id,
    companionID: userID === item.user1.S ? item.user2 : item.user1,
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ ...result, Items }),
  };
};
