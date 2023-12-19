
import {DynamoDBClient, ScanCommand, ListTablesCommand, ListTablesCommandInput} from "@aws-sdk/client-dynamodb";
import {APIGatewayProxyEventV2} from "aws-lambda";

const client = new DynamoDBClient({ region: 'eu-central-1' });


export const handler = async (event: APIGatewayProxyEventV2) => {
    const getCommand = new ScanCommand({
        TableName: 'rsschool-2023-conversations',
        ExpressionAttributeNames: {
            "#ID": "id",
        },
        ProjectionExpression: "#ID",
    });
    const result = await client.send(getCommand);

    const tables: string[] = [];
    let lastTable;

    do {
        const input: ListTablesCommandInput = {
            Limit: 100,
        };

        if (lastTable) {
            input.ExclusiveStartTableName = lastTable;
        }

        const listCommand = new ListTablesCommand(input);

        const reply = await client.send(listCommand);

        tables.push(...reply.TableNames);

        lastTable = reply.LastEvaluatedTableName;
    } while (lastTable);



    return {statusCode: 200, body: JSON.stringify({list: result, tables})};
};
