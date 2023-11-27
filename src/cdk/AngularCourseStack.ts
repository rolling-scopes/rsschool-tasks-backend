import * as cdk from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as alias from "aws-cdk-lib/aws-route53-targets";
import * as apiv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import * as integration from "@aws-cdk/aws-apigatewayv2-integrations-alpha";

import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { Construct } from "constructs";
import { CfnOutput } from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";

type Props = cdk.StackProps & {
  certificateArn: string;
};

const angularTaskApi: {
  path: string;
  method: string;
  lambdaName: string;
}[] = [
  {
    path: "/login",
    method: "POST",
    lambdaName: "login",
  },
  {
    path: "/logout",
    method: "DELETE",
    lambdaName: "logout",
  },
  {
    path: "/registration",
    method: "POST",
    lambdaName: "registration",
  },
  {
    path: "/users",
    method: "GET",
    lambdaName: "users",
  },
  {
    path: "/profile",
    method: "GET",
    lambdaName: "profile-read",
  },
  {
    path: "/profile",
    method: "PUT",
    lambdaName: "profile-update",
  },
  {
    path: "/conversations/list",
    method: "GET",
    lambdaName: "list-my-conversations",
  },
  {
    path: "/conversations/create",
    method: "POST",
    lambdaName: "create-personal-conversation",
  },
  {
    path: "/conversations/delete",
    method: "DELETE",
    lambdaName: "delete-personal-conversation",
  },
  {
    path: "/conversations/read",
    method: "GET",
    lambdaName: "conversation-read-messages",
  },
  {
    path: "/conversations/append",
    method: "POST",
    lambdaName: "conversation-add-message",
  },
  {
    path: "/groups/list",
    method: "GET",
    lambdaName: "groups-list",
  },
  {
    path: "/groups/create",
    method: "POST",
    lambdaName: "groups-create",
  },
  {
    path: "/groups/delete",
    method: "DELETE",
    lambdaName: "groups-delete",
  },
  {
    path: "/groups/read",
    method: "GET",
    lambdaName: "groups-read-messages",
  },
  {
    path: "/groups/append",
    method: "POST",
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

    const httpApi = new apiv2.HttpApi(this, "HttpApi");

    for (const route of angularTaskApi) {
      new apiv2.HttpRoute(this, `Route-${route.path}-${route.method}`, {
        httpApi,
        integration: new integration.HttpLambdaIntegration(
          `Integration-${route.path}-${route.method}`,
          new NodejsFunction(this, `Lambda-${route.lambdaName}`, {
            entry: `./src/functions/${route.lambdaName}.ts`,
            memorySize: 256,
            runtime: Runtime.NODEJS_20_X,
            bundling: {
              externalModules: ["@aws-sdk/*"],
            },
          }),
        ),
        routeKey: apiv2.HttpRouteKey.with("/"),
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
              domainName: httpApi.url!,
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
      },
    );

    // Create a DNS record. in Production it will be an apex record, otherwise we set recordName
    new route53.ARecord(this, "AliasRecord", {
      target: route53.RecordTarget.fromAlias(
        new alias.CloudFrontTarget(distribution),
      ),
      zone: route53.HostedZone.fromLookup(this, "HostedZone", {
        domainName: "rs.school",
      }),
      recordName: this.fqdn,
    });

    new CfnOutput(this, "Url", { value: this.url });
  }
}
