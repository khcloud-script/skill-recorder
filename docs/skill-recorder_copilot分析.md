#### 问：
[skill-recorder](https://github.com/microsoft/skill-recorder/tree/main "https://github.com/microsoft/skill-recorder/tree/main")（[https://github.com/microsoft/skill-recorder](https://github.com/microsoft/skill-recorder "https://github.com/microsoft/skill-recorder")） 是微软的屏幕录制及智能分析工具，请给出一个在内网部署的方案
###### Copilot said:
根据微软开源项目 **Skill Recorder** 的官方说明，它本质上是一个 **Electron 桌面应用**，负责录制用户屏幕、窗口切换、浏览器操作、终端命令和语音信息，然后调用 **GitHub Copilot CLI** 对录制内容进行意图分析，最终生成可复用的 Skill（SKILL.md）或 Automation。github+1 个
如果企业要在**完全内网环境部署**，需要解决两个核心问题：
1. 屏幕录制和数据存储内网化
2. Copilot 分析能力替换为企业内部大模型
---
# 一、推荐总体架构
```PlainText
┌─────────────────────────────┐
│        用户终端PC            │
│                             │
│ Skill Recorder Client       │
│ (Electron改造版本)           │
│                             │
│ 录屏/语音/操作日志采集        │
└─────────────┬───────────────┘
              │HTTPS
              ▼
┌─────────────────────────────┐
│    Skill Recorder Server    │
│                             │
│ Session管理                  │
│ 文件上传                     │
│ 视频切片                     │
│ OCR处理                      │
│ 操作事件提取                 │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│     AI Analysis Server      │
│                             │
│ GPT-4o私有版                 │
│ DeepSeek-R1                 │
│ Qwen3                       │
│ Llama 3.3                   │
│                             │
│ Skill生成引擎                │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│       Skill Repository      │
│                             │
│ GitLab                      │
│ Gitea                       │
│ Azure DevOps Server         │
│                             │
│ SKILL.md版本管理             │
└─────────────────────────────┘
```

---
# 二、部署模式选择

## 方案A：纯离线部署（推荐）
适合：
* 金融
* 政务
* 军工
* 制造业内网

### AI模型
推荐：
| 模型              | 场景     |
| ---------------- | -------- |
| DeepSeek-R1 671B | 最佳推理  |
| DeepSeek-V3      | 性价比    |
| Qwen3-235B       | 中文能力强 |
| Llama 3.3 70B    | 通用      |

部署：
```
Shell 
vllm 
ollama 
SGLang 
TensorRT-LLM 
```

例如：
```
```shell
docker run \
 --gpus all \
 -p 8000:8000 \
 vllm/vllm-openai --model deepseek-ai/DeepSeek-V3
```

然后提供 OpenAI 兼容接口：
```
http://llm.intra.company/v1
```

---
# 三、源码改造点
官方版本依赖 GitHub Copilot CLI。github+1 个
需要替换为：
```
Copilot CLI
    ↓
Enterprise LLM Gateway
```

修改位置大致包括：
```PlainText
src/
electron/
common/
```

增加：
```TypeScript
POST /analyze
 
{
video\_url:"",
transcript:"",
actions:\[]
}
````

返回：
```json
{
	"goal":"创建月度销售报表",
	"steps":[
		"登录ERP",
		"导出销售数据",
		"生成Excel报表",
		"邮件发送"
	]
}
```

---
# 四、内网分析流水线
## Step1 录屏
客户端采集：
```PlainText
屏幕视频
窗口标题
鼠标点击
键盘事件
浏览器URL
终端命令
语音
```

保存：
```PlainText
mp4
json
wav
```

---
## Step2 语音转文字
部署：
### Whisper Large-v3
```shell
faster-whisper
```

或
```PlainText
Azure AI Speech On-Premises
```

输出：
```json
{
	"timestamp":"00:01:22",
	"text":"这里打开ERP系统"
}
```

---
## Step3 OCR
推荐：
### PaddleOCR
```shell
docker run paddleocr
```

提取：
```PlainText
按钮
菜单
表单
错误信息
```

---
## Step4 操作事件分析
输出：
```json
[
	{
		"type":"click",
		"target":"导出"
	},
	{
		"type":"input",
		"field":"客户编号"
	}
]
```

---
## Step5 大模型生成 Skill
Prompt 模板：
```PlainText
你是企业流程分析专家。

目标：
根据用户录屏行为生成可复用业务技能。

输入：

1. 操作事件
2. OCR结果
3. 语音说明

输出：

Goal:
Parameters:
Prerequisites:
Steps:
Validation:
```

生成：
```Markdown
# SKILL

Goal:
生成月度销售统计报表

Parameters: Month

Steps:

1. 登录ERP
2. 打开销售模块
3. 导出指定月份数据
4. 生成Excel
5. 发送至管理层
```

---
# 五、企业级部署方案
## 小规模（100人）
### 服务器
```PlainText
4核CPU
32G内存
2TB SSD
```

AI：
```PlainText
Qwen3-32B
```

GPU：
```PlainText
A800 1张
```

---
## 中规模（1000人）
### 服务器
```PlainText
3节点K8S
```

组件：
```PlainText
Nginx
MinIO
PostgreSQL
Redis
vLLM
```

GPU：
```PlainText
A100 × 4
```

---
## 大规模（5000人+）
```PlainText
Kubernetes
```

模块拆分：
```PlainText
Recorder Service
OCR Service
STT Service
LLM Service
Skill Service
Repository Service
```

存储：
```PlainText
Ceph
MinIO
```

消息队列：
```PlainText
Kafka
```

---
# 六、安全设计
## 数据分级
录屏数据通常包含：
```PlainText
客户信息
账号密码
财务数据
源代码
```

建议增加：
### 敏感信息脱敏
OCR后：
```PlainText
身份证
手机号
银行卡
邮箱
```

自动替换
```PlainText
****
```

---
### 录屏黑名单
禁止录制：
```PlainText
VPN登录页
堡垒机
密码管理器
银行系统
```

---
### 加密存储
```PlainText
AES-256
```

视频：
```PlainText
MinIO SSE
```

数据库：
```PlainText
TDE
```

---
# 七、推荐的最终企业架构
对于大部分企业，我建议采用：
```PlainText
Skill Recorder
  ↓
K8S
  ↓
MinIO
  ↓
Whisper
  ↓
PaddleOCR
  ↓
DeepSeek-V3/R1
  ↓
GitLab Skill库
  ↓
Copilot Studio / 企业Agent
```

这样可以实现：
* 全数据不出内网
* 不依赖 GitHub Copilot 云服务
* 自动生成企业 SOP
* 沉淀可复用 Skill 库
* 后续可接入 Copilot Studio、Agent、RPA 平台
从工程可落地性来看，**“开源 Skill Recorder + Whisper + PaddleOCR + DeepSeek-R1 + GitLab”** 是目前成本最低、效果最好的一套内网部署方案。

__

__
__
##### You said:
把 Whisper 、PaddleOCR 部署方法也提供一下。另外，为什么要 GitLab ?
__
__
###### Copilot said:
你的问题问得很好。
实际上，**GitLab 不是 Skill Recorder 内网部署的必选组件**，而是我建议增加的一层“Skill资产管理平台”。
对于很多企业，第一阶段甚至可以完全不部署 GitLab。
---
# 为什么当时建议 GitLab？
Skill Recorder 最终生成的是：
```PlainText
SKILL.md
```

例如：
```Markdown
# Skill: 月度销售报表

Goal:
生成月度销售报表

Parameters:
Month

Steps:
1. 登录ERP
2. 导出数据
3. 生成Excel
4. 邮件发送
```

如果没有版本库：
```PlainText
Skill1.md
Skill2.md
Skill3.md
```


全部散落在服务器目录里。
后面会出现：
* 谁创建的？
* 谁修改的？
* 历史版本是什么？
* 哪个版本生效？
* 多人如何协作维护？
这些问题。
所以企业一般会把 Skill 当成代码管理：
```PlainText
skills/
 ├── ERP/
 ├── SAP/
 ├── OA/
 ├── 财务/
 └── 客服/
```

然后使用：
* GitLab
* Azure DevOps Server
* Gitea
* SVN
管理。

---
# 哪些情况下不用 GitLab？
如果只是验证PoC：
```PlainText
10~50人
```

可以直接：
```PlainText
MinIO
  +
PostgreSQL
```

保存即可。
架构：
```PlainText
Skill Recorder
  ↓
MinIO
  ↓
DeepSeek
  ↓
Skill文件
```

就够用了。

---
# 什么时候强烈建议 GitLab？
当出现：
```PlainText
100+
用户
```

或者
```PlainText
企业知识沉淀
```

例如：
```PlainText
采购流程
财务流程
SAP流程
MES流程
CRM流程
```

这些都是企业资产。
此时 Skill 实际上已经变成：
```PlainText
企业SOP
```
GitLab就非常有价值。

---

# Whisper 内网部署

对于中文环境，我推荐：
## 方案1 Faster-Whisper（推荐）
性能最好。

部署服务器：
```PlainText
Ubuntu 22.04
CUDA 12.x
```

安装：
```shell
pip install faster-whisper
```

测试：
```python
from faster\_whisper import WhisperModel

model = WhisperModel(
	"large-v3",
	device="cuda",
	compute_type="float16"
)

segments, info = model.transcribe(
	"record.wav",
	beam_size=5
)

for seg in segments:
	print(seg.start, seg.end, seg.text)
```

输出：
```PlainText
0.2 3.4 打开ERP系统
3.5 5.8 输入用户名密码
```

---
## Docker部署
```shell
docker run -d \
  --gpus all \
  --name whisper \
  -p 9000:9000 \
  ghcr.io/systran/faster-whisper
```


很多企业会封装成：
```PlainText
REST API
```

例如：
```PlainText
POST /stt
```

上传：
```PlainText
wav
mp3
mp4
```

返回：
```json
{
	"text":"打开ERP系统..."
}
```

---
## 推荐模型
| 模型      | 显存     |
| -------- | -------- |
| small    | 2GB      |
| medium   | 5GB      |
| large-v3 | 10\~12GB |

对于 Skill Recorder：

```PlainText
large-v3
```

最合适。

---

# PaddleOCR 内网部署
Skill Recorder 录的是视频。
后面需要抽帧：
```PlainText
Frame
  ↓
OCR
  ↓
按钮识别
菜单识别
表单识别
```

---

## Docker方式
```shell
docker pull paddlepaddle/paddle:latest-gpu-cuda11.8-cudnn8
```

启动：
```shell
docker run -it \
  --gpus all \
  -p 8866:8866 \
  paddlepaddle/paddle:latest-gpu-cuda11.8-cudnn8
```

安装：
```shell
pip install paddleocr
pip install paddlepaddle-gpu
```

---

## OCR服务代码
```python
from paddleocr import PaddleOCR

ocr = PaddleOCR(
	use_angle_cls=True,
	lang='ch'
)

result = ocr.ocr(
	'screen.png',
	cls=True
)

print(result)
```

输出：
```json
[
	{
		"text":"导出",
		"score":0.99
	},
	{
		"text":"销售订单",
		"score":0.98
	}
]
```

---

# 用于 Skill Recorder 的生产架构

实际项目里不会每秒都OCR。

通常流程：
```PlainText
视频
  ↓
FFmpeg
  ↓
每2秒抽1帧
  ↓
PaddleOCR
  ↓
文本变化检测
  ↓
送大模型
```

例如：
```PlainText
30分钟录屏
≈54000帧
```

如果全部OCR：
```PlainText
成本极高
```

一般只保留：
```PlainText
500\~1000帧
```

分析即可。

---

# 我更推荐的企业架构
如果你要做生产级落地，我会这样设计：
```PlainText
Skill Recorder Client
  ↓
上传MP4
  ↓
MinIO
  ↓
分析服务
  ├─ Whisper
  ├─ PaddleOCR
  ├─ FFmpeg
  └─ 事件提取
  ↓
DeepSeek-R1
  ↓
Skill生成
  ↓
PostgreSQL
```

第一阶段甚至不需要 GitLab。

等 Skill 数量超过几百个以后，再引入：
```PlainText
GitLab
或
Azure DevOps Server
```

作为 Skill 仓库和版本治理平台。

对于大多数企业内网项目，真正必需的是：
```PlainText
① Skill Recorder（改造版）
② Whisper
③ PaddleOCR
④ DeepSeek / Qwen
⑤ MinIO
⑥ PostgreSQL
```

GitLab 属于第二阶段的“知识资产管理组件”，不是必选项。

<hr style="border-top: 6px double #999"/>


##### You said:
Whisper 和 PaddleOCR 是开源软件吗？
__
__
###### Copilot said:
是的，这两个都是成熟的开源项目，而且目前基本属于企业私有化部署 AI 场景里的标准组件。

### 1. Whisper
Whisper 是 OpenAI 于 2022 年开源的语音识别（ASR）模型，源码和模型权重均已公开。其代码仓库采用 MIT License，商业使用相对宽松。github  
主要特点：
* 语音转文字（Speech-to-Text）
* 支持中文、英文等多语言
* 支持时间戳输出
* 可完全离线运行
* 不依赖 OpenAI API
企业里真正生产使用的通常不是原版 Whisper，而是：

### Faster-Whisper
基于 CTranslate2 优化：
```PlainText
Whisper
  ↓
Faster-Whisper
```

优势：
* 推理速度提升数倍
* GPU利用率更高
* 显存占用更低
* 完全兼容 Whisper 模型
很多企业实际上部署的是：
```PlainText
Faster-Whisper
  +
Whisper large-v3
```

而不是原版 Whisper。

---

### 2. PaddleOCR
PaddleOCR 是百度基于 PaddlePaddle 深度学习框架开源的 OCR 项目。项目代码采用 Apache 2.0 License。Apache 2.0 也是非常友好的商业开源协议。

主要能力：
```PlainText
OCR文字识别
表格识别
文档结构分析
印章识别
票据识别
PDF解析
```

对于 Skill Recorder 场景，主要用：
```PlainText
屏幕截图
  ↓
PaddleOCR
  ↓
识别页面文字
按钮文字
菜单文字
提示信息
```

例如录屏中出现：
```PlainText
销售订单管理

[查询]
[导出]
[保存]
```

OCR结果：
```json
[
	"销售订单管理",
	"查询",
	"导出",
	"保存"
]
```

然后送给大模型分析操作意图。

---

## Skill Recorder 为什么需要这两个组件？

官方 Skill Recorder 当前主要依赖录屏和大模型分析。github+1 个  

如果做企业内网版本，通常会增强成：
```PlainText
录屏视频
  ↓
FFmpeg抽帧
  ↓
PaddleOCR
  ↓
页面文字提取
```

同时：
```PlainText
录制语音
  ↓
Whisper
  ↓
文字稿
```

最后：
```PlainText
OCR结果
  +
语音稿
  +
鼠标点击
  +
键盘事件
  ↓
DeepSeek/Qwen
  ↓
生成Skill
```

所以它们分别解决不同问题：
| 组件           | 作用          |
| -------------- | ------------ |
| Whisper        | 语音 → 文字   |
| PaddleOCR      | 图片 → 文字   |
| DeepSeek/Qwen  | 理解业务流程  |
| Skill Recorder | 采集用户操作  |

---
## 如果预算有限，最简方案是什么？
我建议：
```PlainText
Skill Recorder
  +
Faster-Whisper
  +
DeepSeek-R1
```

甚至可以先不部署 OCR。
因为很多录制者会边操作边讲解：
```PlainText
"现在打开ERP"
"点击销售订单"
"导出Excel"
```

仅依靠语音转写，已经能还原大部分流程。
等项目成熟后再增加：
```PlainText
PaddleOCR
  +
表格识别
  +
页面结构识别
```

精度会进一步提升。
从企业落地经验来看：
**Whisper（或 Faster-Whisper）几乎是必需的；PaddleOCR 则属于增强项，但对于图形界面复杂、用户不爱讲解的场景非常有价值。**
__

<hr style="border-top: 6px double #999;" />

__
##### You said:
如果要在内网部署 skill-recorder，改成用 deepseek ，需要怎么修改？请给出方案
__
__
###### Copilot said:
如果你的目标是：
> **把微软开源的 Skill Recorder 完全内网化，并将其依赖的 GitHub Copilot 替换为企业内网部署的 DeepSeek（或 Qwen）**
那么我建议采用**“最小改造方案”**，不要修改录制模块，只替换分析模块。
因为 Skill Recorder 本身最有价值的是录制能力（屏幕、窗口切换、用户操作采集），而不是大模型调用。官方说明中明确提到分析阶段依赖 GitHub Copilot 来重建 Intent 和 Steps。github+1 个

---

# 一、先看官方架构
官方逻辑大致是：
```PlainText
Record
  ↓
Session
  ↓
Copilot CLI
  ↓
Intent分析
  ↓
Skill生成
```

对应：
```PlainText
┌─────────┐
│ Recorder│
└────┬────┘
     │
     ▼
┌─────────┐
│ Session │
└────┬────┘
     │
     ▼
┌─────────┐
│Copilot  │
│ CLI     │
└────┬────┘
     │
     ▼
┌─────────┐
│ SKILL.md│
└─────────┘
```

内网改造本质上就是：
```PlainText
Copilot CLI
  ↓
DeepSeek API
```

---

# 二、推荐目标架构
## 企业内网版
```PlainText
┌─────────────────┐
│ Skill Recorder  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Session Store   │
│ MP4/WAV/JSON    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Analyze Service │
└───────┬─────────┘
        │
 ┌──────┼──────┐
 │      │      │
 ▼      ▼      ▼
Whisper OCR EventParser
 │      │      │
 └──────┴──────┘
        │
        ▼
   DeepSeek-R1
        │
        ▼
    SKILL.md
```

---

# 三、需要修改哪些部分
实际上只有三处。

---
## 第一处：模型调用
官方：
```PlainText
GitHub Copilot CLI
```

改成：
```PlainText
DeepSeek API
```

例如：
```TypeScript
const response = await fetch(
	"http://deepseek-gateway/v1/chat/completions",
	{
		method:"POST",
		headers:{
			"Authorization":`Bearer ${apiKey}`,
			"Content-Type":"application/json"
		},
		body:JSON.stringify({
			model:"deepseek-r1",
			messages:[...]
		})
});
````

如果用 vLLM：
```PlainText
http\://deepseek-server:8000/v1/chat/completions
``
```

接口完全兼容 OpenAI。

---
## 第二处：分析 Prompt
官方 Prompt 偏向：
```PlainText
生成Copilot Skill
```

企业版建议重新设计。
例如：
```PlainText
你是一名企业流程分析专家。

根据以下信息：

1. 用户录屏操作
2. 鼠标点击事件
3. 键盘输入事件
4. OCR结果
5. 用户语音说明

提取：

- Goal
- Preconditions
- Inputs
- Outputs
- Steps
- Validation

输出Markdown格式。
```

---

输出：
```Markdown
# Skill

Goal:
导出上月销售报表

Inputs:
Month

Steps:

1. 登录ERP
2. 打开销售模块
3. 查询指定月份
4. 点击导出
5. 下载Excel文件

Validation:
成功生成Excel
```

---

## 第三处：Skill落库
推荐增加：
```PlainText
PostgreSQL
```

表：
```sql
CREATE TABLE skills (
	id UUID,
	name VARCHAR(200),
	content TEXT,
	created_time TIMESTAMP
);
```

生成后存进去。

---

# 四、增加 Whisper
官方项目其实并不强依赖 Whisper。
但企业环境非常建议增加。
很多用户会边操作边讲：
```PlainText
"现在打开ERP"

"这里要选择销售订单"

"选择上个月的数据"

"然后点击导出"
```

这些内容对大模型非常重要。

---
新增模块：
```PlainText
Analyze Service
    │
    ▼
Faster-Whisper
```

调用：
```python
from faster_whisper import WhisperModel

model = WhisperModel(
	"large-v3",
	device="cuda"
)

segments, _ = model.transcribe(
	"record.wav"
)
```

输出：
```json
{
	"time":"00:01:30",
	"text":"打开销售订单管理"
}
```

---
# 五、增加 PaddleOCR
录屏里有大量文本：
```PlainText
销售订单管理

导出

保存

客户信息
```

用户未必会念出来。

所以需要：
```PlainText
MP4
  ↓
FFmpeg
  ↓
抽帧
  ↓
PaddleOCR
```

---
例如：
```python
ocr = PaddleOCR(lang="ch")

result = ocr.ocr("frame001.png")
```

输出：
```json
[
	"销售订单管理",
	"导出",
	"保存"
]
```

---

# 六、推荐增加事件解析器
很多流程实际上不需要 OCR。
从行为就能分析。
例如：
```json
{
	"event":"click",
	"target":"导出"
}
```

```json
{
	"event":"input",
	"field":"月份",
	"value":"2025-08"
}
```

这类信息价值非常高。
建议统一整理：
```json
{
	"transcript":"...",
	"ocr":[...],
	"events":[...]
}
```

然后送给 DeepSeek。

---

# 七、最小改造版（推荐）
如果你希望 **2\~4周内上线 PoC**，
不要一开始就搞：
```PlainText
Whisper
PaddleOCR
Kafka
K8S
微服务

```

推荐：
```PlainText
Skill Recorder
  ↓
Session文件
  ↓
DeepSeek-R1
  ↓
Skill生成
```

只改：
```PlainText
Copilot CLI
  ↓
DeepSeek API
```

立即可用。

---

# 八、生产版架构（我推荐）
```PlainText
     Client
(Skill Recorder)
       │
       ▼
MinIO
       │
       ▼
Analyze Service
       │
┌──────┼──────┐
│      │      │
▼      ▼      ▼
Whisper OCR Events
│      │      │
└──────┴──────┘
       │
       ▼
DeepSeek-R1
       │
       ▼
Skill Generator
       │
       ▼
PostgreSQL
       │
       ▼
技能门户
```

这样实现后：
* 录屏数据完全留在内网
* 不依赖 GitHub Copilot
* 不依赖 OpenAI
* 支持 DeepSeek-R1 / DeepSeek-V3 / Qwen3
* 自动生成企业 SOP
* 可逐步对接 Copilot Studio、Agent 或 RPA 平台
从实施成本看，**第一阶段只替换 Copilot CLI 为 DeepSeek API 就能跑起来；Whisper 和 PaddleOCR 可以作为第二阶段增强能力逐步加入。**

<hr style="border-top: 6px double #999;" />

DeepSeek API调用方式？ 
如何替换Copilot CLI？ 
DeepSeek支持哪些模型？

__
__
###### Copilot said:
如果你是要把 **Skill Recorder 改造成企业内网版**，核心工作其实只有一个：
> 找到所有调用 GitHub Copilot CLI 的地方，替换成内部 DeepSeek 服务。

---

# 1. DeepSeek API 调用方式
DeepSeek 官方提供与 OpenAI 兼容的接口。修改 `base_url` 和 `api_key` 即可。deepseek+1 个
## curl
```shell
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
  -d '{
"model":"deepseek-flash",
"messages":\[
{
"role":"system",
"content":"你是企业流程分析专家"
},
{
"role":"user",
"content":"分析以下操作流程..."
}
]
}'
```

官方说明指出 DeepSeek API 兼容 OpenAI/Anthropic API 格式。deepseek

---

## Python
```python
from openai import OpenAI

client = OpenAI(
	api_key="your-key",
	base_url="https://api.deepseek.com"
)

response = client.chat.completions.create(
	model="deepseek-flash",
	messages=[
		{
			"role":"user",
			"content":"分析以下录屏操作"
		}
	]
)

print(response.choices[0].message.content)
```

DeepSeek 官方文档明确说明可以直接使用 OpenAI SDK。deepseek+1 个

---

# 2. Skill Recorder 中如何替换 Copilot CLI
官方流程大致是：
```PlainText
录屏
   ↓
Session
   ↓
Copilot CLI
   ↓
Intent Analysis
   ↓
Skill
```

改造成：
```PlainText
录屏
   ↓
Session
   ↓
DeepSeek Gateway
   ↓
Intent Analysis
   ↓
Skill
```

---
## 方式一（推荐）
新增分析服务：
```PlainText
Skill Recorder
      │
      ▼
Analyze API
      │
      ▼
DeepSeek-R1
```

接口：
```
POST /analyze
```

请求：
```json
{
	"transcript":"...",
	"ocr":"...",
	"events":[...]
}
```

---
返回：
```json
{
	"goal":"导出销售报表",
	"steps":[
		"登录ERP",
		"进入销售模块",
		"导出数据",
		"生成Excel"
	]
}
```

---
然后在 Skill Recorder 中把：
```TypeScript
runCopilotAnalysis(...)
````

替换成：
```TypeScript
await fetch(
	"http://skill-ai/analyze",
	{...}
)
````

这样以后模型升级：
```PlainText
DeepSeek
   ↓
Qwen
   ↓
Llama
   ↓
GPT
```

客户端完全不用动。

---

# 3. DeepSeek 支持哪些模型？
根据当前官方文档：
### 通用模型
```PlainText
deepseek-flash
```

官方推荐使用该模型名。deepseek

特点：
```PlainText
速度快
成本低
适合：
- 文档生成
- Skill生成
- 分类
- 摘要
```

---
### 推理模型
```PlainText
deepseek-v4-pro
```

适用于：
```PlainText
复杂推理
Agent
代码分析
流程理解
```

官方文档将其作为推理能力更强的模型系列。deepseek

---

# 4. 内网部署时推荐哪些模型？

如果完全私有化，不一定要调用 DeepSeek 云 API。
一般会部署：
### 小规模
```PlainText
DeepSeek-V3
```

适合：
```PlainText
Skill生成
SOP生成
知识库问答
```

---

### 中大型企业
```PlainText
DeepSeek-R1
```

适合：
```PlainText
流程分析
Agent规划
多步骤推理
复杂业务流程理解
```

---

# 5. Skill Recorder 最佳实践
我实际会这样设计：
```PlainText
Skill Recorder
      │
      ▼
Session
      │
      ▼
Whisper
      │
      ▼
PaddleOCR
      │
      ▼
Event Parser
      │
      ▼
DeepSeek-R1
      │
      ▼
Skill Generator
      │
      ▼
PostgreSQL
```

Prompt：
```PlainText
你是一名企业流程分析专家。

根据：

1. 用户语音
2. OCR识别结果
3. 鼠标点击事件
4. 键盘输入事件

生成：

Goal
Prerequisites
Inputs
Outputs
Steps
Validation

输出 Markdown。
```

最终生成：
```Markdown
# Skill

Goal:
导出ERP销售报表

Inputs:
月份

Steps:
1. 登录ERP
2. 进入销售订单模块
3. 选择月份
4. 点击导出
5. 下载Excel

Validation:
成功生成Excel文件
```

对于 Skill Recorder 这种场景，我建议：
* PoC阶段：`DeepSeek-V3`
* 生产阶段：`DeepSeek-R1`
* 分析服务封装成独立 REST API
* Skill Recorder 只负责录制和上传
这样后续无论换 DeepSeek、Qwen、Llama 还是 Azure OpenAI，都无需再次修改客户端。


<hr style="border-top: 6px double #999;"/>


<hr style="border-top: 6px double #999;"/>

