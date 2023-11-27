import * as cdk from "aws-cdk-lib";
import { AngularCourseStack } from "./AngularCourseStack";

const app = new cdk.App();

new AngularCourseStack(app, `rsschool-tasks`, {
  env: { account: "511361162520", region: "eu-central-1" },
  certificateArn:
    "arn:aws:acm:us-east-1:511361162520:certificate/07e01035-1bb4-430c-8b82-625565f66bdb",
});
