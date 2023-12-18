import { DynamoDBClient, ScanCommand, DeleteItemCommand, DeleteTableCommand } from "@aws-sdk/client-dynamodb";
import {APIGatewayProxyEventV2} from "aws-lambda";

const client = new DynamoDBClient({ region: 'eu-central-1' });

export const handler = async (event: APIGatewayProxyEventV2) => {

    const getCommand = new ScanCommand({
        TableName: 'rsschool-2023-groups',
        ExpressionAttributeNames: {
            "#ID": "id",
        },
        ProjectionExpression: "#ID",
    });
    const result = await client.send(getCommand);

    const deleteRequests = result.Items.map(item => {
        const groupID = item.id.S;

        const deleteItemCommand = new DeleteItemCommand({
            TableName: "rsschool-2023-groups",
            Key: {
                id: {
                    S: groupID,
                },
            },
            ReturnValues: "NONE",
        });
        const deleteItemQuery = client.send(deleteItemCommand);

        const deleteTableCommand = new DeleteTableCommand({
            TableName: `group-${groupID}`,
        });
        const deleteTableQuery = client.send(deleteTableCommand);


        return Promise.allSettled([deleteItemQuery, deleteTableQuery]).then(res => ({groupID, result: res.status === 'fulfilled' ? res.value : res.reason}));
    });

    const response = await Promise.allSettled(deleteRequests);


    return {
        statusCode: 200,
        body: JSON.stringify(response),
    };
};
