# 能力边界

对照的是编写时能读到的官方文档，不是本仓库里跑出来的 DSH 进程。

文档：

- [Your first plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/)
- [Package and install a plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)
- [Tools](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/tools)
- [Tool catalog](https://deepseek-harness.github.io/deepseek-harness/en/reference/tool-catalog)
- [Filesystem](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/filesystem)
- [Storage](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/storage)
- [Subagents](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/subagent)
- [ui-layout README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-layout/README.md)
- [ui-sidebar README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar/README.md)

`fs/write-intent` 是单槽、先注册者获胜的版本守卫，不是路径允许名单。这个插件不用它做范围拦截。

## 硬门禁

这些由 `src/factory` 的纯函数决定，并用 `node --test` 覆盖。运行中的宿主把同一决定接到 `tools/pre-execute`（返回 `{ kind: 'deny', reason }`）和 `ctx.tools.guard()`（返回原因字符串）。guard 没有允许结果，后面的监听器不能把它改回允许。

运行从「开始调查」起算作进行中，到完成或取消为止。没开始调查时，插件不拦截普通会话里的工具。

- 进行中且计划尚未批准，或者当前不是开发阶段：拒绝 `write`、`edit`、`apply_patch`，以及 `str_replace_editor` 的 `create` / `str_replace` / `insert`。`view` 和 `read` 仍允许。
- 开发阶段只允许改当前任务列出的相对路径。绝对路径必须落在已填写的工作区根下面，否则拒绝。`..` 拒绝。
- 进行中的 `bash` / `pwsh` 只允许命令文本和当前任务的某条 `verifyCommands` 完全一致，且不能改 `workdir`、不能后台运行。其他 shell 命令拒绝。这是整句允许名单，不是按路径解析 shell。
- 进行中还会直接拒绝这些已知写入通道：`terminal_open`、`terminal_send`、`run_code`、`create_worktree`、`office_convert`、`office_recalculate`、`office_render`。
- 暂停、阻断、时间额度用尽时拒绝写入。
- 存储还在恢复时，上述写入通道先拒绝，避免重启窗口里用旧权限写文件。
- Spec 在批准后被修改会递增版本，并把旧 Plan 标为失效。失效计划不能批准，也不能写。
- 没写「必须保留」的既有行为，不能批准需求，也不能开工。重构或「会改变既有行为」不能和计划一次确认，计划里还要写影响。
- 有未决项时，除非这次明确允许，不能批准需求。
- 评审结果不是「通过」，或绑定的版本对不上，不能进入用户验收，也不能点验收通过。
- 验收之后，提交、推送、合并、发布必须按这个顺序各确认一次。控制器不产生 git 效果。
- 取消的效果是 `{ rollback: false, cleanWorktree: false }`。没有清理或回滚函数。脏文件列表在取消后还在。
- 恢复时，已完成任务只有在文件范围、验证命令和验收编号都没变时才保持完成。计划或需求不再有效时，不会停在开发或验收。

宿主在 `ctx.tools.guard` 不可用时拒绝开始调查。存储打不开时拒绝保存任何操作。

## 软约束

- shell 的路径范围。放行的是整句验证命令。这条命令本身仍然可能写范围外的文件。插件没有官方沙箱，也不把命令解析当成硬拦截。
- 削弱测试。删除测试路径、或让 JavaScript 里 `it` / `test` / `describe` / `expect` / `assert` 的调用变少，会被拒绝。别的语言、别的写法，以及没被列进当前任务范围的测试文件，不在这条规则里。
- 花费额度。只有你确认的「不设上限」或一句话。没有接入真实费用，不能按金额拦截。时间额度用控制器时钟拦截写入。
- 调查事实可以由人写进工作台。写代码的门禁不依赖这些文字对不对。
- 工作台里的说明文字不是门禁。

## 还没在真实 DSH 里验证

这个环境没有 `dsh` 可执行文件。下面这些按当前文档写了，但没有执行：

- `dsh plugin add`、`--dump-config`、Web UI 是否真的加载本包。
- `lib/client.js` 是手写的 `window.__ModuleLoader__.load` 工厂，id 为包名 `dsh-software-factory`。没有用官方 `clientBundle()` 重新打包，也没有在浏览器里点开侧栏。
- `main` 使用 `key: 'software-factory'`，`sidebar.panellist` 使用同一个 id。这是 ui-layout / ui-sidebar 文档里的注册方式。没有在运行中的客户端确认 slot 是否接受。
- Host Remote 用 `@deepseek-ai/dsh-typert-protocol` 的 `TypertRemoteService` 和 `Remote()`，浏览器走 `POST /api/softwareFactory/<method>`。这是公开插件里已经在用的网关反射方式，本仓库没有打通过。
- `ctx.storageDomain.open(defineDomain(...))` 按存储文档编写。没有 json/sqlite 后端可开。
- 评审派发调用 `ctx.subagents.startActivation`，`provider` 默认是文档里的示例名 `spawn`，并带上 `agentPreset` 和 `delivery: 'caller'`。提示词是 `{ type: 'text', text }`。这些字段没有对真实子会话跑过。
- 父 Agent 只尝试 `ctx.agents.get(sessionId)`。现行文档没有把这个方法列为公开查找方式。它不存在或抛错时，评审保持未通过，不会改用别的猜测。
- `git status --porcelain=v1` 通过 `ctx.subprocess.spawn`。参数形状来自别的插件，没有在本仓库执行。失败时工作区状态是 `unknown`，不能开始调查。
- `engines.dsh` 会不会被当前安装器拒绝，没有试过。

## 产品验收案例

| 案例 | 测试 | 约束 |
| --- | --- | --- |
| 不清楚不动代码 | `test/acceptance.test.js` | 进行中的文件写入是硬拒绝。真实工具管道未跑 |
| 越界被拒 | 同上 | 文件工具硬拒绝。shell 是整句拒绝，不是路径硬拦 |
| 需求变更失效 | 同上 | 控制器硬拒绝旧计划 |
| 重构保留行为 | 同上 | 控制器硬拒绝 |
| 恢复不重复 | 同上 | `restoreRun` 硬规则。真实重启未跑 |
| 评审不过不能交付 | 同上 | 控制器硬拒绝。子会话本身未跑 |
| 既有脏目录保护 | 同上，加 `test/dirty.test.js` | 没有清理动作。真实 `git status` 未跑 |
