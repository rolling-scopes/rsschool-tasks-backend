import querystring from "querystring";
import {DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand} from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEventV2 } from "aws-lambda";

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

  console.log("-post data", data);

  if (!(data.conversationID && data.message)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "InvalidPostData",
        message:
          'Post data should contain valid "conversationID", "message" parameters.',
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



  const command = new PutItemCommand({
    TableName: `conversation-${data.conversationID}`,
    Item: {
      authorID: {
        S: userID,
      },
      message: {
        S: data.message,
      },
      createdAt: {
        S: new Date().getTime().toString(),
      },
    },
    ReturnItemCollectionMetrics: "NONE",
  });

  try {
    const result = await client.send(command);

    console.log("-result", result);
  } catch (err) {
    if ((err as Error).name === "ResourceNotFoundException") {
      // new conversation could not be created so quickly
      const input = {
        TableName: "rsschool-2023-conversations",
        Key: {
          id: {
            S: data.conversationID,
          },
        },
      };

      const verifyCommand = new GetItemCommand(input);
      const result = await client.send(verifyCommand);

      console.log('-verify', result);

      if (result.Item) {
        return { statusCode: 400, body: JSON.stringify({ type: 'RoomReadyException', message: `Conversation with id "${data.conversationID}" seems not ready yet` }) };
      }

      return {
        statusCode: 400,
        body: JSON.stringify({
          type: "InvalidIDException",
          message: `Conversation with id "${data.conversationID}" does not exist or was deleted before.`,
        }),
      };
    }
  }

  return {
    statusCode: 201,
  };
};
