import querystring from "querystring";
import crypto from "crypto";

import {
  DynamoDBClient,
  UpdateItemCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEventV2 } from "aws-lambda";

const client = new DynamoDBClient({ region: "eu-central-1" });

export const handler = async (event: APIGatewayProxyEventV2) => {
  console.log("-event", event);

  const contentType =
    event.headers["content-type"] ?? event.headers["Content-Type"];

  let body = event.body;
  let data: Record<string, string>;

  if (!body) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "InvalidFormDataException",
        message: "Invalid post data",
      }),
    };
  }

  if (event.isBase64Encoded && body) {
    body = Buffer.from(body, "base64").toString("utf-8");
  }

  if (contentType === "application/x-www-form-urlencoded") {
    data = querystring.parse(body) as Record<string, string>;
  } else if (contentType?.startsWith("multipart/form-data")) {
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    const boundary = match?.[1] ?? match?.[2];

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

  if (!(data.email && data.password)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "InvalidFormDataException",
        message: 'Parameters "email" and "password" are required.',
      }),
    };
  }

  const passwordHash = crypto
    .createHash("sha256")
    .update(data.password)
    .digest("hex");

  const getCommand = new GetItemCommand({
    TableName: "rsschool-2023-users",
    Key: {
      email: {
        S: data.email,
      },
    },
  });
  let result = await client.send(getCommand);

  const uid = result.Item?.uid?.S;

  console.log("-response", result);

  if (!uid || passwordHash !== result.Item?.password.S) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "NotFoundException",
        message: "Email and/or password doesn't exist in the system.",
      }),
    };
  }

  const token = Math.random().toString(36).substring(2);

  const updateCommand = new UpdateItemCommand({
    TableName: "rsschool-2023-users",
    Key: {
      email: {
        S: data.email,
      },
    },
    UpdateExpression: "SET #T = :t",
    ExpressionAttributeNames: {
      "#T": "token",
    },
    ExpressionAttributeValues: {
      ":t": {
        S: token,
      },
    },
  });
  result = await client.send(updateCommand);

  return {
    statusCode: 200,
    body: JSON.stringify({ token, uid }),
  };
};
