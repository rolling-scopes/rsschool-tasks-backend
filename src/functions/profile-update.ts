import { APIGatewayProxyEventV2 } from "aws-lambda";
import querystring from "querystring";

import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "eu-central-1" });

export const handler = async (event: APIGatewayProxyEventV2) => {
  console.log("-event", event);

  const userID = event.headers["rs-uid"];
  const userEmail = event.headers["rs-email"];
  const userTokenRaw =
    event.headers["Authorization"] ?? event.headers["authorization"];
  const contentType =
    event.headers["content-type"] ?? event.headers["Content-Type"];

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

  let body = event.body;
  let data: Record<string, string>;

  if (event.isBase64Encoded) {
    body = new Buffer(body, "base64").toString("utf-8");
  }

  if (contentType === "application/x-www-form-urlencoded") {
    data = querystring.parse(body) as Record<string, string>;
  } else if (contentType?.startsWith("multipart/form-data")) {
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    const boundary = match[1] ?? match[2];

    if (!boundary) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          type: "InvalidFormDataException",
          message: "Invalid multipart/form-data request",
        }),
      };
    }

    const parts = body.split(`--${boundary}`);
    data = {};

    // Process each part
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i].trim();

      if (part) {
        const val = part
          .replace("Content-Disposition: form-data; ", "")
          .split(/[\r\n]+/);

        if (val?.length === 2) {
          const propName = /name="(.+)"/.exec(val[0])?.[1];
          const propValue = val[1];

          if (propName && propValue) {
            data[propName] = propValue;
          }
        }
      }
    }
  } else if (contentType === "application/json") {
    data = JSON.parse(body);
  } else {
    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "InvalidFormDataException",
        message: "Invalid post data",
      }),
    };
  }

  if (!data.name) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "InvalidFormDataException",
        message: 'You have to pass "name" field.',
      }),
    };
  }

  const updateCommand = new UpdateItemCommand({
    TableName: "rsschool-2023-users",
    Key: {
      email: {
        S: userEmail,
      },
    },
    ConditionExpression: "#T = :t AND #U = :u",
    UpdateExpression: "SET #N = :name",
    ExpressionAttributeNames: {
      "#T": "token",
      "#U": "uid",
      "#N": "name",
    },
    ExpressionAttributeValues: {
      ":name": {
        S: data.name,
      },
      ":u": {
        S: userID,
      },
      ":t": {
        S: userToken,
      },
    },
  });

  try {
    await client.send(updateCommand);
  } catch (err) {
    if ((err as Error).name === "ConditionalCheckFailedException") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          type: "InvalidIDException",
          message: "User was not found. Check passed identificators.",
        }),
      };
    }

    throw err;
  }

  return {
    statusCode: 201,
  };
};
