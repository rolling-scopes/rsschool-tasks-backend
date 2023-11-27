import querystring from "querystring";

import {
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
  CreateTableCommand,
  ScanInput,
  CreateTableCommandInput,
} from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEventV2 } from "aws-lambda";

const client = new DynamoDBClient({ region: "eu-central-1" });

export const handler = async (event: APIGatewayProxyEventV2) => {
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
      body: JSON.stringify("Invalid post data"),
    };
  }

  if (!data.companion) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'Parameter "companion" should be defined.',
      }),
    };
  }

  const sortingData = [userID, data.companion];
  sortingData.sort();

  const [user1, user2] = sortingData;

  const queryInput: ScanInput = {
    TableName: "rsschool-2023-conversations",
    FilterExpression: "user1 = :user1Value AND user2 = :user2Value",
    ExpressionAttributeValues: {
      ":user1Value": {
        S: user1,
      },
      ":user2Value": {
        S: user2,
      },
    },
    Select: "COUNT",
  };

  const queryCommand = new ScanCommand(queryInput);
  let result = await client.send(queryCommand);

  if (result.Count > 0) {
    // conversation between people already exists
    return {
      statusCode: 400,
      body: JSON.stringify({
        type: "DuplicationNotAllowedException",
        message: "Conversation already exists.",
      }),
    };
  }

  const currentDate = new Date();
  const conversationID = Math.random().toString(36).substring(2);

  // create dedicated conversation table
  const newTableInput: CreateTableCommandInput = {
    TableName: `conversation-${conversationID}`,
    BillingMode: "PAY_PER_REQUEST",
    TableClass: "STANDARD",
    DeletionProtectionEnabled: false,
    SSESpecification: {
      Enabled: false,
    },
    StreamSpecification: {
      StreamEnabled: false,
    },
    AttributeDefinitions: [
      { AttributeName: "authorID", AttributeType: "S" },
      { AttributeName: "createdAt", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "authorID", KeyType: "HASH" },
      { AttributeName: "createdAt", KeyType: "RANGE" },
    ],
  };
  const newTableCommand = new CreateTableCommand(newTableInput);

  result = await client.send(newTableCommand);

  // save conversation id in list
  const input = {
    TableName: "rsschool-2023-conversations",
    Item: {
      id: {
        S: conversationID,
      },
      user1: {
        S: user1,
      },
      user2: {
        S: user2,
      },
      createdAt: {
        S: currentDate.getTime().toString(),
      },
    },
    ConditionExpression: "attribute_not_exists(id)",
  };

  const command = new PutItemCommand(input);

  result = await client.send(command);

  return {
    statusCode: 201,
    body: JSON.stringify({ conversationID }),
  };
};
