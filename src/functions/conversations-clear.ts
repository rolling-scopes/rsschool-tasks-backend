import { DynamoDBClient, ScanCommand, DeleteItemCommand, DeleteTableCommand } from "@aws-sdk/client-dynamodb";
import {APIGatewayProxyEventV2} from "aws-lambda";

const client = new DynamoDBClient({ region: 'eu-central-1' });

export const handler = async (event: APIGatewayProxyEventV2) => {

    const getCommand = new ScanCommand({
        TableName: 'rsschool-2023-conversations',
        ExpressionAttributeNames: {
            "#ID": "id",
            "#U1": "user1",
            "#U2": "user2",
        },
        ProjectionExpression: "#ID, #U1, #U2",
    });
    const result = await client.send(getCommand);

    const deleteRequests = result.Items.map(item => {
        const conversationID = item.id.S;

        const deleteItemCommand = new DeleteItemCommand({
            TableName: "rsschool-2023-conversations",
            Key: {
                id: {
                    S: conversationID,
                },
            },
            ReturnValues: "NONE",
        });
        const deleteItemQuery = client.send(deleteItemCommand);

        const deleteTableCommand = new DeleteTableCommand({
            TableName: `conversation-${conversationID}`,
        });
        const deleteTableQuery = client.send(deleteTableCommand);


        return Promise.allSettled([deleteItemQuery, deleteTableQuery]).then(res => ({conversationID, tableDeleted: res[1].status === 'fulfilled' ? res[1].value : res[1].reason, recordDeleted: res[0].status === 'fulfilled' ? res[0].value : res[0].reason}));
    });

    const response = await Promise.allSettled(deleteRequests);


    return {
        statusCode: 200,
        body: JSON.stringify(response),
    };
};
