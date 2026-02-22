# IAM Permissions & CloudFormation Template

**Part of:** OpenClaw Backup to S3 Skill

---

## IAM Permissions Required

### For Backup Operations

**Policy name:** `OpenClawBackupPolicy`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3BackupAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion",
        "s3:ListBucket",
        "s3:ListBucketVersions"
      ],
      "Resource": [
        "arn:aws:s3:::BACKUP_BUCKET_NAME",
        "arn:aws:s3:::BACKUP_BUCKET_NAME/*"
      ]
    },
    {
      "Sid": "SecretsManagerAccess",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:PutSecretValue",
        "secretsmanager:CreateSecret",
        "secretsmanager:UpdateSecret",
        "secretsmanager:DescribeSecret",
        "secretsmanager:ListSecrets"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:openclaw/*"
    },
    {
      "Sid": "KMSAccess",
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:Encrypt",
        "kms:your-userrateDataKey",
        "kms:DescribeKey"
      ],
      "Resource": "arn:aws:kms:*:*:key/*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": [
            "s3.us-west-2.amazonaws.com",
            "secretsmanager.us-west-2.amazonaws.com"
          ]
        }
      }
    }
  ]
}
```

### For Restore Operations (Minimal Permissions)

**For NEW instance restoring from backup:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3RestoreReadOnly",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::BACKUP_BUCKET_NAME",
        "arn:aws:s3:::BACKUP_BUCKET_NAME/*"
      ]
    },
    {
      "Sid": "SecretsManagerReadOnly",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:openclaw/*"
    }
  ]
}
```

**Note:** Restore only needs READ access!

---

## Attach Permissions to Instance

**Option 1: Update existing IAM role**

```bash
# Get current instance role
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
ROLE_NAME=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn' \
  --output text | cut -d'/' -f2)

# Attach backup policy
aws iam put-role-policy \
  --role-name $ROLE_NAME \
  --policy-name OpenClawBackupPolicy \
  --policy-document file://backup-policy.json
```

**Option 2: Create new role with CloudFormation** (see below)

---

## CloudFormation Template for Restore Instance

**Use case:** Spin up NEW instance to restore from backup

**Template:** `cloudformation/restore-instance.yaml`

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'OpenClaw Restore Instance with minimal permissions'

Parameters:
  InstanceType:
    Type: String
    Default: t3.medium
    Description: EC2 instance type
    
  BackupBucket:
    Type: String
    Description: S3 bucket containing backups
    
  KeyName:
    Type: AWS::EC2::KeyPair::KeyName
    Description: SSH key pair for instance access
    
  VpcId:
    Type: AWS::EC2::VPC::Id
    Description: VPC to launch instance in
    
  SubnetId:
    Type: AWS::EC2::Subnet::Id
    Description: Subnet to launch instance in

Resources:
  # IAM Role for restore instance
  RestoreInstanceRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub '${AWS::StackName}-RestoreRole'
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: ec2.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
      Policies:
        - PolicyName: RestorePermissions
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Sid: S3RestoreReadOnly
                Effect: Allow
                Action:
                  - s3:GetObject
                  - s3:GetObjectVersion
                  - s3:ListBucket
                Resource:
                  - !Sub 'arn:aws:s3:::${BackupBucket}'
                  - !Sub 'arn:aws:s3:::${BackupBucket}/*'
              - Sid: SecretsManagerReadOnly
                Effect: Allow
                Action:
                  - secretsmanager:GetSecretValue
                  - secretsmanager:DescribeSecret
                Resource: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:openclaw/*'
              - Sid: KMSDecrypt
                Effect: Allow
                Action:
                  - kms:Decrypt
                  - kms:DescribeKey
                Resource: '*'

  RestoreInstanceProfile:
    Type: AWS::IAM::InstanceProfile
    Properties:
      Roles:
        - !Ref RestoreInstanceRole

  RestoreSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for OpenClaw restore instance
      VpcId: !Ref VpcId
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 22
          ToPort: 22
          CidrIp: 0.0.0.0/0
          Description: SSH access (restrict to your IP!)
      SecurityGroupEgress:
        - IpProtocol: -1
          CidrIp: 0.0.0.0/0
          Description: Allow all outbound

  RestoreInstance:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: !Ref InstanceType
      ImageId: !Sub '{{resolve:ssm:/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id}}'
      IamInstanceProfile: !Ref RestoreInstanceProfile
      KeyName: !Ref KeyName
      SubnetId: !Ref SubnetId
      SecurityGroupIds:
        - !Ref RestoreSecurityGroup
      BlockDeviceMappings:
        - DeviceName: /dev/sda1
          Ebs:
            VolumeSize: 30
            VolumeType: gp3
            Encrypted: true
      UserData:
        Fn::Base64: !Sub |
          #!/bin/bash
          set -e
          
          # Update system
          apt-get update
          apt-get upgrade -y
          
          # Install dependencies
          apt-get install -y curl wget git build-essential
          
          # Install Node.js via nvm
          su - ubuntu -c "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
          su - ubuntu -c "source ~/.nvm/nvm.sh && nvm install 22.22.0 && nvm use 22.22.0"
          
          # Install OpenClaw
          su - ubuntu -c "source ~/.nvm/nvm.sh && npm install -g openclaw"
          
          # Download restore script
          su - ubuntu -c "aws s3 cp s3://${BackupBucket}/scripts/restore.sh /home/ubuntu/restore.sh"
          su - ubuntu -c "chmod +x /home/ubuntu/restore.sh"
          
          # Create restore instructions
          cat > /home/ubuntu/RESTORE_INSTRUCTIONS.txt << 'EOF'
          OpenClaw Restore Instance Ready!
          
          To restore from backup:
          1. SSH into this instance
          2. Run: ./restore.sh
          3. Follow prompts
          
          The restore script will:
          - Download latest backup from S3
          - Restore all files
          - Install dependencies
          - Start OpenClaw gateway
          
          Backup bucket: ${BackupBucket}
          EOF
          
          echo "Restore instance ready!"
      Tags:
        - Key: Name
          Value: !Sub '${AWS::StackName}-RestoreInstance'
        - Key: Purpose
          Value: OpenClaw-Restore

Outputs:
  InstanceId:
    Description: Instance ID
    Value: !Ref RestoreInstance
    
  PublicIP:
    Description: Public IP address
    Value: !GetAtt RestoreInstance.PublicIp
    
  SSHCommand:
    Description: SSH command to connect
    Value: !Sub 'ssh -i ${KeyName}.pem ubuntu@${RestoreInstance.PublicIp}'
    
  RestoreCommand:
    Description: Command to run after SSH
    Value: './restore.sh'
```

---

## Restore Instructions (Simplest)

### Step 1: Launch Restore Instance

**Using CloudFormation:**

```bash
aws cloudformation create-stack \
  --stack-name openclaw-restore \
  --template-body file://cloudformation/restore-instance.yaml \
  --parameters \
    ParameterKey=BackupBucket,ParameterValue=your-backup-bucket \
    ParameterKey=KeyName,ParameterValue=your-ssh-key \
    ParameterKey=VpcId,ParameterValue=vpc-xxxxx \
    ParameterKey=SubnetId,ParameterValue=subnet-xxxxx \
  --capabilities CAPABILITY_NAMED_IAM

# Wait for stack to complete
aws cloudformation wait stack-create-complete \
  --stack-name openclaw-restore

# Get instance IP
aws cloudformation describe-stacks \
  --stack-name openclaw-restore \
  --query 'Stacks[0].Outputs[?OutputKey==`PublicIP`].OutputValue' \
  --output text
```

### Step 2: SSH and Restore

```bash
# SSH into new instance
ssh -i your-key.pem ubuntu@<INSTANCE_IP>

# Restore script is already downloaded by UserData
./restore.sh

# Follow prompts
```

### Step 3: Verify

```bash
# Check OpenClaw status
openclaw status

# Send test message via Telegram
# Should respond with full context!
```

---

## One-Command Restore (Advanced)

**For emergency situations:**

```bash
# Create instance + restore in one command
./emergency-restore.sh \
  --backup-bucket your-backup-bucket \
  --ssh-key your-key \
  --vpc vpc-xxxxx \
  --subnet subnet-xxxxx
```

**Script automates:**
1. Launch CloudFormation stack
2. Wait for instance ready
3. SSH and run restore
4. Verify OpenClaw running
5. Report status

---

## Cost Estimate

**CloudFormation stack running costs:**
- t3.medium: ~$0.0416/hour = ~$1/day
- 30 GB gp3 EBS: ~$2.40/month
- Data transfer: Minimal

**Recommendation:** Terminate stack after successful restore

```bash
# After restore complete, terminate
aws cloudformation delete-stack --stack-name openclaw-restore
```

---

## Security Notes

⚠️ **CloudFormation template has SSH open to 0.0.0.0/0**

**For production:** Restrict to your IP:

```yaml
SecurityGroupIngress:
  - IpProtocol: tcp
    FromPort: 22
    ToPort: 22
    CidrIp: YOUR_IP/32  # Change this!
    Description: SSH from your IP only
```

---

## Files to Create

1. `cloudformation/restore-instance.yaml` - Stack template
2. `scripts/emergency-restore.sh` - One-command restore
3. `iam/backup-policy.json` - IAM policy for backups
4. `iam/restore-policy.json` - Minimal IAM for restore
5. `docs/RESTORE-INSTRUCTIONS.md` - Step-by-step guide

---

**Simplest restore:** Launch CloudFormation stack, SSH in, run `./restore.sh`. Done! 🚀
