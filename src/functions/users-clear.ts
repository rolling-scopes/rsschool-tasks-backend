import { DynamoDBClient, ScanCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import {APIGatewayProxyEventV2} from "aws-lambda";

const client = new DynamoDBClient({ region: 'eu-central-1' });

export const handler = async (event: APIGatewayProxyEventV2) => {

    const getCommand = new ScanCommand({
        TableName: 'rsschool-2023-users',
        ExpressionAttributeNames: {
            "#E": "email",
        },
        ProjectionExpression: "#E",
    });
    const result = await client.send(getCommand);

    const deleteRequests = result.Items.map(item => {
        const email = item.email.S;

        const deleteItemCommand = new DeleteItemCommand({
            TableName: "rsschool-2023-users",
            Key: {
                email: {
                    S: email,
                },
            },
            ReturnValues: "NONE",
        });
        const deleteItemQuery = client.send(deleteItemCommand);


        return deleteItemQuery.then(res => ({email, recordDeleted: res}), reason => ({email, recordDeleted: reason}));
    });

    const response = await Promise.allSettled(deleteRequests);


    return {
        statusCode: 200,
        body: JSON.stringify(response),
    };
};
