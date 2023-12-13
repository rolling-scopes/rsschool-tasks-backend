import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as alias from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";

import {
  HttpMethod,
  HttpApi,
  CorsHttpMethod,
  HttpRoute,
  HttpRouteKey,
} from "aws-cdk-lib/aws-apigatewayv2";
import * as integration from "aws-cdk-lib/aws-apigatewayv2-integrations";

import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";

import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime, Architecture } from "aws-cdk-lib/aws-lambda";

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

    const httpApi = new HttpApi(this, "AngularTask", {
      corsPreflight: {
        allowOrigins: ["*"],
        allowHeaders: ["*"],
        allowMethods: [CorsHttpMethod.ANY],
      },
    });

    httpApi.addStage("angular", {
      autoDeploy: true,
      stageName: "angular",
      throttle: {
        rateLimit: 10,
      },
    });

    const usersTable = dynamodb.Table.fromTableName(
      this,
      "UsersTable",
      "rsschool-2023-users"
    );

    const groupsTable = dynamodb.Table.fromTableName(
      this,
      "GroupsTable",
      "rsschool-2023-groups"
    );

    const conversationsTable = dynamodb.Table.fromTableName(
      this,
      "ConversationsTable",
      "rsschool-2023-conversations"
    );

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
                `arn:aws:dynamodb:${this.region}:${this.account}:table/group-*`,
                `arn:aws:dynamodb:${this.region}:${this.account}:table/conversation-*`,
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
      new HttpRoute(this, `Route-${route.path}-${route.method}`, {
        httpApi,
        integration: new integration.HttpLambdaIntegration(
          `Integration-${route.path}-${route.method}`,
          lambda
        ),
        routeKey: HttpRouteKey.with(`${baseUrl}${route.path}`, route.method),
      });
    }

    const distribution = new cloudfront.Distribution(this, "Tasks", {
      defaultBehavior: {
        origin: new origins.HttpOrigin(
          `${httpApi.httpApiId}.execute-api.${this.region}.amazonaws.com`,
          {
            originPath: "/angular",
          }
        ),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        responseHeadersPolicy:
          cloudfront.ResponseHeadersPolicy
            .CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      domainNames: [this.fqdn],
      certificate: acm.Certificate.fromCertificateArn(
        this,
        "certificate",
        certificateArn
      ),
    });

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
