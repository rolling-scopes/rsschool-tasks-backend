import querystring from "querystring";
import crypto from "crypto";

import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "eu-central-1" });

export const handler = async (event) => {
  console.log("-event", event);

  const contentType =
    event.headers["content-type"] ?? event.headers["Content-Type"];

  let body = event.body;
  let data;

  if (event.isBase64Encoded) {
    body = new Buffer(body, "base64").toString("utf-8");
  }

  if (contentType === "application/x-www-form-urlencoded") {
    data = querystring.parse(body);
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

  if (!(data.email && data.password && data.name)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "InvalidFormDataException",
        message: 'Parameters "email", "name" and "password" are required',
      }),
    };
  }

  console.log("-data", data);
  data.passwordHash = crypto
    .createHash("sha256")
    .update(data.password)
    .digest("hex");

  const currentDate = new Date();
  const uid = Math.random().toString(36).substring(2);

  const input = {
    TableName: "rsschool-2023-users",
    Item: {
      email: {
        S: data.email,
      },
      uid: {
        S: uid,
      },
      name: {
        S: data.name,
      },
      token: {
        S: "",
      },
      password: {
        S: data.passwordHash,
      },
      createdAt: {
        S: currentDate.getTime().toString(),
      },
      isVerified: {
        BOOL: false,
      },
    },
    ConditionExpression:
      "attribute_not_exists(email) AND attribute_not_exists(uid)",
  };

  const command = new PutItemCommand(input);

  try {
    const response = await client.send(command);
    console.log("-db result", response);

    return {
      statusCode: 201,
    };
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      // user already exists

      return {
        statusCode: 400,
        body: JSON.stringify({
          type: "PrimaryDuplicationException",
          message: `User ${data.email} already exists`,
        }),
      };
    } else {
      console.log(typeof err);
      throw err;
    }
  }
};
