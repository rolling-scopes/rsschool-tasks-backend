import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as alias from "aws-cdk-lib/aws-route53-targets";
import * as apiv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import * as integration from "@aws-cdk/aws-apigatewayv2-integrations-alpha";

import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime, Architecture } from "aws-cdk-lib/aws-lambda";
import { HttpMethod } from "@aws-cdk/aws-apigatewayv2-alpha";

type Props = cdk.StackProps & {
  certificateArn: string;
};

const angularTaskApi: {
  path: string;
  method: HttpMethod;
  lambdaName: string;
}[] = [
  {
    path: "/login",
    method: HttpMethod.POST,
    lambdaName: "login",
  },
  {
    path: "/logout",
    method: HttpMethod.DELETE,
    lambdaName: "logout",
  },
  {
    path: "/registration",
    method: HttpMethod.POST,
    lambdaName: "registration",
  },
  {
    path: "/users",
    method: HttpMethod.GET,
    lambdaName: "users",
  },
  {
    path: "/profile",
    method: HttpMethod.GET,
    lambdaName: "profile-read",
  },
  {
    path: "/profile",
    method: HttpMethod.PUT,
    lambdaName: "profile-update",
  },
  {
    path: "/conversations/list",
    method: HttpMethod.GET,
    lambdaName: "list-my-conversations",
  },
  {
    path: "/conversations/create",
    method: HttpMethod.POST,
    lambdaName: "create-personal-conversation",
  },
  {
    path: "/conversations/delete",
    method: HttpMethod.DELETE,
    lambdaName: "delete-personal-conversation",
  },
  {
    path: "/conversations/read",
    method: HttpMethod.GET,
    lambdaName: "conversation-read-messages",
  },
  {
    path: "/conversations/append",
    method: HttpMethod.POST,
    lambdaName: "conversation-add-message",
  },
  {
    path: "/groups/list",
    method: HttpMethod.GET,
    lambdaName: "groups-list",
  },
  {
    path: "/groups/create",
    method: HttpMethod.POST,
    lambdaName: "groups-create",
  },
  {
    path: "/groups/delete",
    method: HttpMethod.DELETE,
    lambdaName: "groups-delete",
  },
  {
    path: "/groups/read",
    method: HttpMethod.GET,
    lambdaName: "groups-read-messages",
  },
  {
    path: "/groups/append",
    method: HttpMethod.POST,
    lambdaName: "groups-add-message",
  },
];

export class AngularCourseStack extends cdk.Stack {
  fqdn: string;
  url: string;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const { certificateArn } = props;

    this.fqdn = `tasks.app.rs.school`;
    this.url = `https://${this.fqdn}`;

    const baseUrl = "/angular";

    const httpApi = new apiv2.HttpApi(this, "AngularTask");

    const usersTable = new dynamodb.Table(this, "UsersTable", {
      tableName: "rsschool-2023-users",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "email",
        type: dynamodb.AttributeType.STRING,
      },
    });

    const groupsTable = new dynamodb.Table(this, "GroupsTable", {
      tableName: "rsschool-2023-groups",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
    });

    const conversationsTable = new dynamodb.Table(this, "ConversationsTable", {
      tableName: "rsschool-2023-conversations",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
    });

    const lambdaRole = new iam.Role(this, `AngularTaskLambdaRole`, {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      inlinePolicies: {
        cloudWatch: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["logs:*"],
              resources: ["arn:aws:logs:*:*:*"],
            }),
          ],
        }),
        lambdaRole: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                "dynamodb:Scan",
                "dynamodb:Query",
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:CreateTable",
                "dynamodb:DescribeTable",
                "dynamodb:DeleteTable",
              ],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/rsschool-2023-*`,
              ],
            }),
          ],
        }),
        usersTable: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                "dynamodb:Scan",
                "dynamodb:Query",
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
              ],
              resources: [
                usersTable.tableArn,
                groupsTable.tableArn,
                conversationsTable.tableArn,
              ],
            }),
          ],
        }),
      },
    });

    for (const route of angularTaskApi) {
      const lambda = new NodejsFunction(
        this,
        `AngularTask-${route.lambdaName}`,
        {
          entry: `./src/functions/${route.lambdaName}.ts`,
          memorySize: 256,
          runtime: Runtime.NODEJS_20_X,
          bundling: {
            externalModules: ["@aws-sdk/*"],
          },
          role: lambdaRole,
          timeout: cdk.Duration.seconds(30),
          architecture: Architecture.ARM_64,
        }
      );
      new apiv2.HttpRoute(this, `Route-${route.path}-${route.method}`, {
        httpApi,
        integration: new integration.HttpLambdaIntegration(
          `Integration-${route.path}-${route.method}`,
          lambda
        ),
        routeKey: apiv2.HttpRouteKey.with(
          `${baseUrl}${route.path}`,
          route.method
        ),
      });
    }

    const noCacheBehavior: cloudfront.Behavior = {
      allowedMethods: cloudfront.CloudFrontAllowedMethods.ALL,
      defaultTtl: cdk.Duration.seconds(0),
      minTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.seconds(0),
      forwardedValues: {
        queryString: true,
        headers: ["Origin", "Authorization"],
        cookies: {
          forward: "all",
        },
      },
    };

    const distribution = new cloudfront.CloudFrontWebDistribution(
      this,
      "Tasks",
      {
        originConfigs: [
          {
            customOriginSource: {
              domainName: `${httpApi.httpApiId}.execute-api.${this.region}.amazonaws.com`,
              originProtocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            },
            behaviors: [
              {
                isDefaultBehavior: true,
                pathPattern: "/angular/*",
                ...noCacheBehavior,
              },
            ],
          },
        ],
        defaultRootObject: "/",
        viewerCertificate: {
          aliases: [this.fqdn],
          props: {
            // cloudfront needs certificate in us-east-1 so we pass it as string
            acmCertificateArn: certificateArn,
            sslSupportMethod: "sni-only",
            minimumProtocolVersion: "TLSv1.2_2019",
          },
        },
      }
    );

    // Create a DNS record. in Production it will be an apex record, otherwise we set recordName
    new route53.ARecord(this, "AliasRecord", {
      target: route53.RecordTarget.fromAlias(
        new alias.CloudFrontTarget(distribution)
      ),
      zone: route53.HostedZone.fromLookup(this, "HostedZone", {
        domainName: "rs.school",
      }),
      recordName: this.fqdn,
    });

    new cdk.CfnOutput(this, "API Url", { value: `${this.url}${baseUrl}` });
  }
}
