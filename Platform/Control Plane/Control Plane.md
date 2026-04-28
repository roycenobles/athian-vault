# Control Plane

Pure infrastructure CDK — no Lambda functions, no APIs, no databases. Two CDK apps that establish baseline AWS account configuration: IAM group/policy setup for internal teams, and cross-account observability linking.

## control-plane-app (IAM)

Deploys IAM groups and a shared user policy to the `devops` account. Gives internal teams appropriate access to AWS.

### IAM Groups

| Group | Path | Permissions |
|-------|------|-------------|
| `engineering-admin` | `/athian/` | `PowerUserAccess` |
| `engineering` | `/athian/` | X-Ray read-only, CloudWatch read-only, CloudWatch dashboards |
| `product-management` | `/athian/` | X-Ray read-only, CloudWatch read-only, CloudWatch dashboards |
| `quality-assurance` | `/athian/` | X-Ray read-only, CloudWatch read-only, CloudWatch dashboards |

### DefaultAthianUserPolicy

Managed policy applied to all groups. Allows IAM users to self-manage their own credentials per AWS best practices:

- View account info (`iam:GetAccountPasswordPolicy`, `iam:ListUsers`, `iam:ListVirtualMFADevices`)
- Change own password (`iam:ChangePassword`, `iam:GetUser`)
- Manage own access keys (create, delete, list, update, get last used)
- Create and manage own MFA device

## control-plane-client-app (Observability)

Deploys an **AWS OAM (Observability Access Manager) link** from each stage account to a central monitoring account. Enables cross-account observability — CloudWatch metrics, log groups, and X-Ray traces from source accounts are visible in the monitoring account.

| Property | Value |
|----------|-------|
| Resource types shared | `AWS::CloudWatch::Metric`, `AWS::Logs::LogGroup`, `AWS::XRay::Trace` |
| Label template | `$AccountName` |
| Sink | Central monitoring account OAM sink (`us-east-1`) |

The monitoring account ID is supplied via CDK context key `@athian/monitoringAccountId`. A guard prevents accidentally linking the monitoring account to itself.
