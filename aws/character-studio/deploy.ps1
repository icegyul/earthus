param(
  [string]$Region = 'us-east-2',
  [string]$Bucket = 'earthus-cache-kr',
  [string]$DistributionId = 'E193CZEBLWEB56',
  [string]$Profile = ''
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$buildRoot = Join-Path $repoRoot 'artifacts\character-studio-deploy'
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
function Invoke-Aws([string[]]$Arguments) {
  $callArgs = @($Arguments) + @('--region', $Region, '--no-cli-pager')
  if ($Profile) { $callArgs += @('--profile', $Profile) }
  $result = & aws @callArgs
  if ($LASTEXITCODE -ne 0) { throw "AWS operation failed: $($Arguments[0]) $($Arguments[1])" }
  return $result
}
# Fail before changing infrastructure if AWS login is missing.
$accountId = (Invoke-Aws @('sts', 'get-caller-identity', '--query', 'Account', '--output', 'text')).Trim()
$configFile = Join-Path $repoRoot 'prototype\js\config.local.js'
if (-not (Test-Path -LiteralPath $configFile)) { throw 'Existing administrator configuration is missing.' }
$extract = "import {pathToFileURL} from 'node:url'; const {CONFIG:c}=await import(pathToFileURL(process.argv[1])); console.log(JSON.stringify({url:c.SUPABASE_URL,anon:c.SUPABASE_ANON_KEY,hasAdmins:Array.isArray(c.ADMIN_UIDS)&&c.ADMIN_UIDS.length>0}));"
$configJson = & node --input-type=module -e $extract $configFile
if ($LASTEXITCODE -ne 0) { throw 'Cannot read existing public authentication configuration.' }
$publicConfig = $configJson | ConvertFrom-Json
if (-not $publicConfig.url -or -not $publicConfig.anon -or -not $publicConfig.hasAdmins) { throw 'Supabase and administrator UID configuration must be completed first.' }
$archive = Join-Path $buildRoot 'function.zip'
Compress-Archive -LiteralPath (Join-Path $PSScriptRoot 'handler.py') -DestinationPath $archive -Force
$digest = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$codeKey = "character-studio/deploy/$digest.zip"
Invoke-Aws @('s3', 'cp', $archive, "s3://$Bucket/$codeKey", '--content-type', 'application/zip', '--only-show-errors') | Out-Null
$functionName = 'earthus-character-studio'
$functionArn = "arn:aws:lambda:${Region}:${accountId}:function:$functionName"
$logArn = "arn:aws:logs:${Region}:${accountId}:log-group:/aws/lambda/${functionName}:*"
$parameter = '/earthus/character-studio/openai-api-key'
$template = @{
  AWSTemplateFormatVersion = '2010-09-09'
  Description = 'EARTHUS paper character studio. Optional OpenAI SSM key; Supabase admin authentication.'
  Resources = @{
    Logs = @{ Type='AWS::Logs::LogGroup'; Properties=@{ LogGroupName="/aws/lambda/$functionName"; RetentionInDays=14 } }
    Role = @{ Type='AWS::IAM::Role'; Properties=@{
      AssumeRolePolicyDocument=@{ Version='2012-10-17'; Statement=@(@{ Effect='Allow'; Principal=@{Service='lambda.amazonaws.com'}; Action='sts:AssumeRole' }) }
      Policies=@(@{ PolicyName='CharacterStudioOnly'; PolicyDocument=@{ Version='2012-10-17'; Statement=@(
        @{ Effect='Allow'; Action=@('s3:GetObject','s3:PutObject'); Resource=@("arn:aws:s3:::${Bucket}/character-studio/*", "arn:aws:s3:::${Bucket}/app/v3/characters/*") },
        @{ Effect='Allow'; Action='s3:ListBucket'; Resource="arn:aws:s3:::$Bucket"; Condition=@{ StringLike=@{'s3:prefix'=@('character-studio/records/*')} } },
        @{ Effect='Allow'; Action=@('logs:CreateLogStream','logs:PutLogEvents'); Resource=$logArn },
        @{ Effect='Allow'; Action='lambda:InvokeFunction'; Resource=$functionArn },
        @{ Effect='Allow'; Action='ssm:GetParameter'; Resource="arn:aws:ssm:${Region}:${accountId}:parameter$parameter" }
      ) } })
    } }
    Function = @{ Type='AWS::Lambda::Function'; DependsOn=@('Logs'); Properties=@{
      FunctionName=$functionName; Runtime='python3.13'; Handler='handler.handler'; Timeout=300; MemorySize=512
      Role=@{'Fn::GetAtt'=@('Role','Arn')}; Code=@{S3Bucket=$Bucket; S3Key=$codeKey}
      Environment=@{ Variables=@{ CACHE_BUCKET=$Bucket; CACHE_REGION=$Region; SUPABASE_URL=$publicConfig.url; SUPABASE_ANON_KEY=$publicConfig.anon; OPENAI_KEY_PARAMETER=$parameter; ALLOWED_ORIGIN='https://earthus.net' } }
    } }
    URL = @{ Type='AWS::Lambda::Url'; Properties=@{ TargetFunctionArn=@{Ref='Function'}; AuthType='NONE' } }
    UrlPermission = @{ Type='AWS::Lambda::Permission'; Properties=@{ FunctionName=@{Ref='Function'}; Action='lambda:InvokeFunctionUrl'; Principal='*'; FunctionUrlAuthType='NONE' } }
    InvokePermission = @{ Type='AWS::Lambda::Permission'; Properties=@{ FunctionName=@{Ref='Function'}; Action='lambda:InvokeFunction'; Principal='*'; InvokedViaFunctionUrl=$true } }
    AsyncConfig = @{ Type='AWS::Lambda::EventInvokeConfig'; Properties=@{ FunctionName=@{Ref='Function'}; Qualifier='$LATEST'; MaximumRetryAttempts=0; MaximumEventAgeInSeconds=600 } }
  }
  Outputs=@{ ApiUrl=@{Value=@{'Fn::GetAtt'=@('URL','FunctionUrl')}} }
}
$templatePath = Join-Path $buildRoot 'template.json'
[IO.File]::WriteAllText($templatePath, ($template | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))
Invoke-Aws @('cloudformation','deploy','--stack-name','earthus-character-studio','--template-file',$templatePath,'--capabilities','CAPABILITY_IAM','--no-fail-on-empty-changeset') | Out-Null
$endpoint = (Invoke-Aws @('cloudformation','describe-stacks','--stack-name','earthus-character-studio','--query','Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue | [0]','--output','text')).Trim()
if ($endpoint -notmatch '^https://[a-z0-9]+\.lambda-url\.[a-z0-9-]+\.on\.aws/$') { throw 'Unexpected API endpoint.' }
# Only the public endpoint is placed in browser code. The image key stays in SSM.
$endpointModule = "// Public endpoint only. The OpenAI key stays in AWS SSM.`nexport const CHARACTER_API_URL = '$endpoint';`n"
$endpointPath = Join-Path $repoRoot 'prototype\v3-kids\character-config.js'
[IO.File]::WriteAllText($endpointPath, $endpointModule, [Text.UTF8Encoding]::new($false))
$staticFiles = @('character-core.js','paper-character.js','character-config.js','character-globe.js','character-studio.js','character-studio.css','character-studio.html','index.html')
foreach ($file in $staticFiles) {
  $mime = if ($file.EndsWith('.js')) {'text/javascript; charset=utf-8'} elseif ($file.EndsWith('.css')) {'text/css; charset=utf-8'} else {'text/html; charset=utf-8'}
  Invoke-Aws @('s3','cp',(Join-Path $repoRoot "prototype\v3-kids\$file"),"s3://$Bucket/app/v3/$file",'--content-type',$mime,'--cache-control','no-cache','--only-show-errors') | Out-Null
}
# The existing site uses exact objects for /v3 and /v3/ because S3 REST has no directory index.
foreach ($key in @('app/v3','app/v3/')) {
  Invoke-Aws @('s3api','put-object','--bucket',$Bucket,'--key',$key,'--body',(Join-Path $repoRoot 'prototype\v3-kids\index.html'),'--content-type','text/html; charset=utf-8','--cache-control','no-cache') | Out-Null
}
Invoke-Aws @('s3','cp',(Join-Path $repoRoot 'prototype\admin.html'),"s3://$Bucket/app/admin.html",'--content-type','text/html; charset=utf-8','--cache-control','no-cache','--only-show-errors') | Out-Null
Invoke-Aws @('cloudfront','create-invalidation','--distribution-id',$DistributionId,'--paths','/v3','/v3/','/v3/*','/admin.html') | Out-Null
$probe = Invoke-WebRequest -Uri 'https://earthus.net/v3/character-studio.html' -UseBasicParsing
if ($probe.StatusCode -ne 200 -or -not $probe.Content.Contains('character-studio.js')) { throw 'Published page verification failed.' }
Write-Output 'Character studio published: https://earthus.net/v3/character-studio.html'
Write-Output 'OpenAI key is optional. Later add a SecureString parameter in SSM at /earthus/character-studio/openai-api-key.'
