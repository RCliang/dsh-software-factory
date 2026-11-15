window.__ModuleLoader__.load({
  id: 'dsh-software-factory',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const inject = ['slots']

    const CSS = `
.sf { height: 100%; min-height: 720px; display: flex; flex-direction: column; color: #1b1f26; background: #fff; font: 13px/1.55 "PingFang SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif; }
.sf * { box-sizing: border-box; }
.sf button, .sf input, .sf textarea, .sf select { font: inherit; color: inherit; }
.sf button { cursor: pointer; }
.sf-bar { display: flex; gap: 8px; align-items: center; min-height: 56px; padding: 8px 16px; border-bottom: 1px solid #e2e5ea; }
.sf-brand { display: flex; gap: 8px; align-items: center; font-weight: 650; margin-right: 8px; }
.sf-mark { width: 22px; height: 22px; border-radius: 6px; background: #1f6feb; color: #fff; display: grid; place-items: center; font-size: 11px; }
.sf-pill { display: inline-flex; gap: 6px; align-items: center; padding: 4px 10px; border-radius: 999px; background: #eef0f3; color: #5a6370; white-space: nowrap; }
.sf-pill b { color: #1b1f26; }
.sf-pill.wait { background: #fff3e0; color: #9a4d00; font-weight: 650; }
.sf-pill.run { background: #eef4ff; color: #175cd3; font-weight: 650; }
.sf-pill.ok { background: #e8f7ee; color: #087443; }
.sf-body { flex: 1; min-height: 0; display: flex; }
.sf-flow { width: 220px; flex: 0 0 220px; background: #f6f7f9; border-right: 1px solid #e2e5ea; overflow: auto; padding: 12px 8px; }
.sf-flow h2 { margin: 4px 8px 8px; font-size: 11px; letter-spacing: .08em; color: #8a93a0; }
.sf-step { width: 100%; display: flex; gap: 8px; text-align: left; background: transparent; border: 0; border-radius: 8px; padding: 8px; }
.sf-step.current { background: #fff; outline: 1px solid #e2e5ea; }
.sf-step:disabled { color: #8a93a0; cursor: not-allowed; }
.sf-idx { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font-size: 10px; background: #e4e7ec; }
.sf-step.done .sf-idx { background: #e8f7ee; color: #087443; }
.sf-step.current .sf-idx { background: #1f6feb; color: #fff; }
.sf-meta { color: #8a93a0; font-size: 11px; }
.sf-main { flex: 1; overflow: auto; padding: 20px 28px 28px; }
.sf-main h1 { margin: 0 0 4px; font-size: 18px; }
.sf-lede { color: #5a6370; margin: 0 0 14px; }
.sf-banner { border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; }
.sf-banner.note { background: #eef4ff; color: #175cd3; }
.sf-banner.warn { background: #fff3e0; color: #9a4d00; }
.sf-banner.bad { background: #fdecea; color: #b42318; }
.sf-banner.ok { background: #e8f7ee; color: #087443; }
.sf-card, .sf-props { border: 1px solid #e2e5ea; border-radius: 10px; padding: 12px 14px; margin: 12px 0; }
.sf-grid { display: grid; gap: 12px; }
.sf-grid.two { grid-template-columns: 1fr 1fr; }
.sf label span, .sf-label { display: block; font-size: 12px; font-weight: 650; color: #5a6370; margin-bottom: 4px; }
.sf input, .sf textarea, .sf select { width: 100%; border: 1px solid #cdd2da; border-radius: 8px; padding: 8px 10px; background: #fff; }
.sf textarea { min-height: 72px; resize: vertical; }
.sf-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 14px; }
.sf-btn { border: 1px solid #cdd2da; background: #fff; border-radius: 8px; padding: 7px 12px; }
.sf-btn.primary { background: #1f6feb; border-color: #1f6feb; color: #fff; }
.sf-btn.danger { color: #b42318; border-color: #f0b4ae; }
.sf-btn:disabled { opacity: .45; cursor: not-allowed; }
.sf table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.sf th, .sf td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #e2e5ea; vertical-align: top; }
.sf code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; background: #eef0f3; padding: 1px 5px; border-radius: 4px; }
.sf-chat { width: 260px; flex: 0 0 260px; background: #f6f7f9; border-left: 1px solid #e2e5ea; display: flex; flex-direction: column; }
.sf-chat header, .sf-dock { padding: 12px 14px; font-weight: 650; }
.sf-thread { flex: 1; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.sf-bubble { background: #fff; border: 1px solid #e2e5ea; border-radius: 10px; padding: 8px 10px; }
.sf-dock { display: flex; gap: 8px; align-items: center; border-top: 1px solid #e2e5ea; background: #fff; }
.sf-log { display: none; white-space: pre-wrap; background: #0f141a; color: #d7dde5; border-radius: 8px; padding: 10px; }
.sf-log.show { display: block; }
.sf-modal { position: fixed; inset: 0; background: rgba(20,24,32,.4); display: flex; align-items: center; justify-content: center; }
.sf-dialog { width: 420px; background: #fff; border-radius: 12px; padding: 18px; }
`

    function rpc(method, args) {
      const message = {
        type: 'client-request',
        rpcId: 'sf-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        method,
        payload: { args },
      }
      return fetch('/api/' + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(message),
      }).then((res) => {
        if (!res.ok) throw new Error(method + ' HTTP ' + res.status)
        return res.json()
      }).then((full) => {
        const result = full && full.result
        if (!result) throw new Error(method + ' 返回空响应')
        return result
      })
    }

    function call(method, args) {
      return rpc('softwareFactory/' + method, { request: args || {} })
    }

    function Field(label, value, onChange, multiline) {
      return h('label', null,
        h('span', null, label),
        multiline
          ? h('textarea', { value: value || '', onChange: (event) => onChange(event.target.value) })
          : h('input', { value: value || '', onChange: (event) => onChange(event.target.value) }))
    }

    function Banner(kind, text) {
      if (!text) return null
      return h('div', { className: 'sf-banner ' + kind }, text)
    }

    function Actions(children) {
      return h('div', { className: 'sf-actions' }, children)
    }

    function Btn(props, label) {
      return h('button', { className: 'sf-btn' + (props.primary ? ' primary' : '') + (props.danger ? ' danger' : ''), disabled: props.disabled, onClick: props.onClick }, label)
    }

    function Workbench() {
      const [model, setModel] = React.useState(null)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [view, setView] = React.useState('start')
      const [log, setLog] = React.useState(false)
      const [cancelOpen, setCancelOpen] = React.useState(false)
      const [records, setRecords] = React.useState(false)
      const mounted = React.useRef(true)

      const applyResult = React.useCallback((result) => {
        if (!mounted.current) return
        if (result && result.ok === false && result.error) setError(result.error)
        else setError('')
        if (result && (result.run || result.hydrating)) setModel(result)
      }, [])

      const runCall = React.useCallback((method, args) => {
        setBusy(true)
        return call(method, args).then((result) => {
          applyResult(result)
          return result
        }).catch((err) => {
          if (mounted.current) setError(String(err.message || err))
        }).finally(() => { if (mounted.current) setBusy(false) })
      }, [applyResult])

      React.useEffect(() => {
        mounted.current = true
        const pull = () => call('snapshot').then(applyResult).catch((err) => {
          if (mounted.current) setError(String(err.message || err))
        })
        pull()
        const timer = setInterval(pull, 3000)
        return () => { mounted.current = false; clearInterval(timer) }
      }, [applyResult])

      const run = model && model.run
      const projection = model && model.view
      React.useEffect(() => {
        if (!projection) return
        const current = projection.steps.find((step) => step.status === 'current')
        if (current) setView(current.id)
      }, [run && run.phase])

      if (!model) return h('div', { className: 'sf' }, h('div', { className: 'sf-main' }, '正在连接软件工厂…'))
      if (model.hydrating) return h('div', { className: 'sf' }, h('div', { className: 'sf-main' }, '正在从持久存储恢复已批准版本…'))

      const phase = run.phase
      const screen = records ? 'records' : (phase === 'blocked' ? 'blocked' : view)
      const stepAllowed = (id) => {
        const step = projection.steps.find((item) => item.id === id)
        return step && step.status !== 'locked'
      }

      return h('div', { className: 'sf' },
        h('header', { className: 'sf-bar' },
          h('div', { className: 'sf-brand' }, h('span', { className: 'sf-mark' }, '厂'), '软件工厂'),
          h('span', { className: 'sf-pill ' + projection.tone }, h('b', null, projection.waitingOnUser ? '等你确认' : (phase === 'done' ? '已完成' : '系统进行中')), ' ', projection.phaseLabel),
          h('span', { className: 'sf-pill' }, projection.specLabel),
          h('span', { className: 'sf-pill' }, projection.planLabel),
          h('span', { className: 'sf-pill' }, projection.budgetLabel)),
        h('div', { className: 'sf-body' },
          h('nav', { className: 'sf-flow' },
            h('h2', null, '任务流'),
            projection.steps.map((step, index) => h('button', {
              key: step.id,
              className: 'sf-step' + (screen === step.id ? ' current' : '') + (step.status === 'done' ? ' done' : ''),
              disabled: step.status === 'locked',
              onClick: () => { if (stepAllowed(step.id)) { setRecords(false); setView(step.id) } },
            }, h('span', { className: 'sf-idx' }, step.status === 'done' ? '✓' : String(index + 1)),
              h('span', null, h('div', null, step.name), h('div', { className: 'sf-meta' }, step.meta))))),
          h('main', { className: 'sf-main' },
            Banner(!model.durable ? 'bad' : 'note', !model.durable ? ('状态不能持久化，所有操作会拒绝保存。' + (model.storageError || '')) : ''),
            Banner(model.gateInstalled ? 'ok' : 'bad', model.gateInstalled ? '文件工具门禁已安装。shell 只按验证命令整句放行，不是按路径硬拦。' : ('门禁未安装：' + (model.gateReason || ''))),
            Banner(error ? 'bad' : '', error),
            Banner(run.paused ? 'warn' : '', run.paused ? '已暂停。写入会被拒绝。现场和已批准版本都还在。' : ''),
            screen === 'start' ? StartScreen(run, projection, runCall, busy) : null,
            screen === 'investigate' ? InvestigateScreen(run, runCall, busy) : null,
            screen === 'clarify' ? ClarifyScreen(run, runCall, busy) : null,
            screen === 'spec' ? SpecScreen(run, projection, runCall, busy) : null,
            screen === 'plan' ? PlanScreen(run, projection, runCall, busy) : null,
            screen === 'develop' ? DevelopScreen(run, projection, runCall, busy, log, setLog) : null,
            screen === 'blocked' ? BlockedScreen(run, runCall, busy) : null,
            screen === 'review' ? ReviewScreen(run, runCall, busy) : null,
            screen === 'accept' ? AcceptScreen(run, projection, runCall, busy) : null,
            screen === 'release' ? ReleaseScreen(run, projection, runCall, busy) : null,
            screen === 'records' ? RecordsScreen(run) : null),
          h('aside', { className: 'sf-chat' },
            h('header', null, '对话与备注'),
            h('div', { className: 'sf-thread' },
              (run.questions || []).map((question, index) => h('div', { className: 'sf-bubble', key: index },
                h('div', { className: 'sf-meta' }, '澄清'),
                question.text,
                h('div', { className: 'sf-meta' }, question.why))),
              (run.notes || []).slice(-8).map((note, index) => h('div', { className: 'sf-bubble', key: 'n' + index }, note.text)),
              h('div', { className: 'sf-meta' }, '正式确认用中间的按钮完成，不在这里点。')),
            h('form', { className: 'sf-actions', style: { padding: 10 }, onSubmit: (event) => {
              event.preventDefault()
              const input = event.target.elements.note
              const text = input.value.trim()
              if (!text) return
              runCall('addNote', { text }).then(() => { input.value = '' })
            } },
              h('input', { name: 'note', placeholder: '备注。正式确认不在这里完成。' }),
              h('button', { className: 'sf-btn', type: 'submit' }, '记下')))),
        h('footer', { className: 'sf-dock' },
          Btn({ disabled: busy || !run.engaged, onClick: () => runCall(run.paused ? 'resumePause' : 'pause') }, run.paused ? '继续' : '暂停'),
          Btn({ danger: true, disabled: busy || phase === 'done' || phase === 'cancelled', onClick: () => setCancelOpen(true) }, '取消'),
          Btn({ onClick: () => setRecords(true) }, '查看记录'),
          h('span', { className: 'sf-meta' }, '取消只停止后续执行，不会回滚，也不会清理未提交改动。')),
        cancelOpen ? h('div', { className: 'sf-modal' }, h('div', { className: 'sf-dialog' },
          h('h2', null, '取消这次运行？'),
          h('p', null, '取消不等于回滚。已经改过的文件会留在工作区，工厂不会自动清理。'),
          Actions([
            Btn({ primary: true, onClick: () => runCall('cancel').then(() => setCancelOpen(false)) }, '确认取消'),
            Btn({ onClick: () => setCancelOpen(false) }, '留下'),
          ]))) : null)
    }

    function StartScreen(run, projection, runCall, busy) {
      const [goal, setGoal] = React.useState(run.goal || '')
      const [minutes, setMinutes] = React.useState(run.budget.timeLimitMinutes ? String(run.budget.timeLimitMinutes) : '')
      const [spendChoice, setSpend] = React.useState(run.budget.spendChoice || 'no-cap')
      const [spendNote, setSpendNote] = React.useState(run.budget.spendNote || '')
      const [root, setRoot] = React.useState(run.workspaceRoot || '')
      const [rounds, setRounds] = React.useState(String(run.defaults.maxReworkRounds))
      const [manual, setManual] = React.useState((run.dirty.files || []).join('\n'))
      return h('section', null,
        h('h1', null, '开始'),
        h('p', { className: 'sf-lede' }, '先确认要做什么、工作区状态和额度。这些决定完成前，不能开始调查，更不能改代码。下面的返修次数是建议默认，不是已经替你批准的政策。'),
        Field('要做什么', goal, setGoal, true),
        Field('工作区根目录（可选，绝对路径写入需要它）', root, setRoot),
        h('div', { className: 'sf-grid two' },
          Field('时间额度（分钟，由你填写）', minutes, setMinutes),
          h('label', null, h('span', null, '花费额度'),
            h('select', { value: spendChoice, onChange: (event) => setSpend(event.target.value) },
              h('option', { value: 'no-cap' }, '本次不设费用上限'),
              h('option', { value: 'note' }, '只用一句话说明，不编造金额')),
            spendChoice === 'note' ? h('textarea', { value: spendNote, onChange: (event) => setSpendNote(event.target.value) }) : null)),
        Field('每个任务最多自动返修几轮（建议 2）', rounds, setRounds),
        Banner(run.dirty.status === 'dirty' ? 'warn' : 'note',
          run.dirty.status === 'unknown'
            ? ('还不能确定工作区是否干净。' + (run.dirty.detail || '可以重新读取，或自己声明。'))
            : (run.dirty.status === 'clean' ? '工作区看起来是干净的。' : '有未提交改动。工厂不会自动清理。')),
        run.dirty.files && run.dirty.files.length ? h('ul', null, run.dirty.files.map((file) => h('li', { key: file }, h('code', null, file)))) : null,
        Actions([
          Btn({ disabled: busy, onClick: () => runCall('refreshDirty') }, '重新读取工作区'),
          Btn({ disabled: busy, onClick: () => {
            const files = manual.split('\n').map((line) => line.trim()).filter(Boolean)
            return runCall('declareDirty', { status: files.length ? 'dirty' : 'clean', files })
          } }, '按下面的列表声明'),
        ]),
        h('textarea', { value: manual, placeholder: '每行一个未提交文件；留空表示你声明工作区是干净的', onChange: (event) => setManual(event.target.value) }),
        run.dirty.status === 'dirty' ? Actions([
          Btn({ disabled: busy, onClick: () => runCall('chooseDirty', { choice: 'handle' }) }, '先处理这些改动'),
          Btn({ primary: true, disabled: busy, onClick: () => runCall('chooseDirty', { choice: 'allow' }) }, '允许在现有改动上继续'),
          Btn({ disabled: busy, onClick: () => runCall('chooseDirty', { choice: 'cancel' }) }, '取消'),
        ]) : null,
        Actions([
          Btn({ disabled: busy, onClick: () => runCall('setGoal', { goal }).then(() => runCall('setWorkspaceRoot', { workspaceRoot: root })).then(() => runCall('setMaxRework', { rounds: Number(rounds) })).then(() => runCall('setBudget', {
            timeLimitMinutes: Number(minutes),
            spendChoice,
            spendNote,
          })).then(() => runCall('acknowledgeStart')) }, '确认额度和建议默认'),
          Btn({ primary: true, disabled: busy || !projection.can.start, onClick: () => runCall('startInvestigation') }, '开始调查'),
        ]))
    }

    function InvestigateScreen(run, runCall, busy) {
      const report = run.investigation || { facts: [], inferences: [], locations: [] }
      const [facts, setFacts] = React.useState(report.facts.join('\n'))
      const [inferences, setInferences] = React.useState(report.inferences.join('\n'))
      const [locations, setLocations] = React.useState(report.locations.join('\n'))
      return h('section', null,
        h('h1', null, '调查'),
        h('p', { className: 'sf-lede' }, '正在了解项目，暂不改代码。调查未完成不得开始提问。'),
        Banner('note', '此阶段文件工具和 shell 都会被拒绝。这里记录的是已查证事实；子会话派发还没有在真实 DSH 里验证，所以由你把事实写入工作台。'),
        Field('已查证事实，每行一条', facts, setFacts, true),
        Field('推测，每行一条', inferences, setInferences, true),
        Field('可能影响的位置，每行一条', locations, setLocations, true),
        Actions([
          Btn({ disabled: busy, onClick: () => runCall('recordInvestigation', {
            facts: facts.split('\n').map((line) => line.trim()).filter(Boolean),
            inferences: inferences.split('\n').map((line) => line.trim()).filter(Boolean),
            locations: locations.split('\n').map((line) => line.trim()).filter(Boolean),
          }) }, '保存现状'),
          Btn({ primary: true, disabled: busy, onClick: () => runCall('completeInvestigation') }, '调查完成，进入澄清'),
        ]))
    }

    function ClarifyScreen(run, runCall, busy) {
      const [q1, setQ1] = React.useState(run.questions[0] ? run.questions[0].text : '')
      const [w1, setW1] = React.useState(run.questions[0] ? run.questions[0].why : '')
      const [q2, setQ2] = React.useState(run.questions[1] ? run.questions[1].text : '')
      const [w2, setW2] = React.useState(run.questions[1] ? run.questions[1].why : '')
      return h('section', null,
        h('h1', null, '澄清'),
        h('p', { className: 'sf-lede' }, '每次只放一到两个问题，并写明为什么不能从代码里直接查到。你可以直接改需求草稿，不必把问题答完。'),
        Field('问题 1', q1, setQ1),
        Field('为什么要问', w1, setW1),
        Field('问题 2（可空）', q2, setQ2),
        Field('为什么要问', w2, setW2),
        Actions([
          Btn({ disabled: busy, onClick: () => {
            const questions = []
            if (q1.trim()) questions.push({ text: q1, why: w1 })
            if (q2.trim()) questions.push({ text: q2, why: w2 })
            return runCall('setQuestions', { questions })
          } }, '保存问题'),
          Btn({ primary: true, disabled: busy, onClick: () => runCall('openSpec') }, '去确认需求'),
        ]))
    }

    function specState(run) {
      const fields = run.spec.fields
      return {
        ...fields,
        acceptanceText: fields.acceptance.map((item) => item.id + ' ' + item.statement).join('\n'),
        openText: fields.openItems.map((item) => item.id + ' ' + item.text).join('\n'),
        behavior: fields.touchesExistingBehavior === true ? 'yes' : (fields.touchesExistingBehavior === false ? 'no' : ''),
      }
    }

    function parseLines(text, kind) {
      return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line, index) => {
        const split = line.indexOf(' ')
        const id = split > 0 ? line.slice(0, split) : (kind + (index + 1))
        const rest = split > 0 ? line.slice(split + 1) : line
        return kind === 'A' ? { id, statement: rest } : { id, text: rest }
      })
    }

    function SpecScreen(run, projection, runCall, busy) {
      const initial = specState(run)
      const [goal, setGoal] = React.useState(initial.goal)
      const [currentBehavior, setCurrent] = React.useState(initial.currentBehavior)
      const [scenario, setScenario] = React.useState(initial.scenario)
      const [preserve, setPreserve] = React.useState(initial.preserve)
      const [outOfScope, setOut] = React.useState(initial.outOfScope)
      const [acceptanceText, setAcceptance] = React.useState(initial.acceptanceText)
      const [openText, setOpen] = React.useState(initial.openText)
      const [behavior, setBehavior] = React.useState(initial.behavior)
      const [refactor, setRefactor] = React.useState(initial.refactor)
      const fields = {
        goal, currentBehavior, scenario, preserve, outOfScope,
        acceptance: parseLines(acceptanceText, 'A'),
        openItems: parseLines(openText, 'Q'),
        touchesExistingBehavior: behavior === 'yes' ? true : (behavior === 'no' ? false : null),
        refactor,
      }
      const openCount = fields.openItems.filter((item) => item.text).length
      return h('section', null,
        h('h1', null, '需求确认'),
        h('p', { className: 'sf-lede' }, '你确认的是具体版本。需求一改，后续计划会失效。'),
        Banner('note', '需求 v' + run.spec.version + ' · ' + (run.spec.status === 'approved' ? '已批准' : '草稿')),
        Field('目标', goal, setGoal),
        Field('当前行为及依据', currentBehavior, setCurrent, true),
        Field('场景与边界', scenario, setScenario, true),
        Field('必须保留', preserve, setPreserve, true),
        Field('明确不做', outOfScope, setOut, true),
        Field('编号验收项，每行如 A1 当前列表可导出 CSV', acceptanceText, setAcceptance, true),
        Field('未决项，每行一条；没有就留空', openText, setOpen, true),
        h('label', null, h('span', null, '是否改变既有行为'),
          h('select', { value: behavior, onChange: (event) => setBehavior(event.target.value) },
            h('option', { value: '' }, '未说明'),
            h('option', { value: 'no' }, '不改变既有行为'),
            h('option', { value: 'yes' }, '会改变既有行为'))),
        h('label', null, h('input', { type: 'checkbox', checked: refactor, onChange: (event) => setRefactor(event.target.checked) }), ' 包含重构'),
        openCount ? Banner('warn', '有 ' + openCount + ' 个未决项。默认不能进入计划，除非你明确允许带着未决项继续。') : null,
        projection.separateConfirmation ? Banner('warn', '这是重构或既有行为变化，必须和计划分开确认。') : null,
        Actions([
          Btn({ disabled: busy, onClick: () => runCall('updateSpec', { fields }) }, '保存需求草稿'),
          Btn({ disabled: busy || !openCount, onClick: () => runCall('updateSpec', { fields }).then(() => runCall('allowOpenItems')) }, '允许带未决项继续'),
          Btn({ primary: true, disabled: busy, onClick: () => runCall('updateSpec', { fields }).then(() => runCall('approveSpec')) }, '批准需求版本 v' + run.spec.version),
        ]))
    }

    function PlanScreen(run, projection, runCall, busy) {
      const [impact, setImpact] = React.useState(run.plan.existingBehaviorImpact || '')
      const [tasksText, setTasks] = React.useState(JSON.stringify(run.plan.tasks || [], null, 2))
      const [parseError, setParseError] = React.useState('')
      const save = () => {
        let tasks = []
        try { tasks = JSON.parse(tasksText) } catch {
          setParseError('任务 JSON 无法解析')
          return Promise.resolve({ ok: false })
        }
        setParseError('')
        return runCall('updatePlan', { plan: { tasks, existingBehaviorImpact: impact } })
      }
      return h('section', null,
        h('h1', null, '计划确认'),
        h('p', { className: 'sf-lede' }, '批准该计划版本后才允许写代码。小改可以和需求一次确认，但这里仍然分成需求摘要和计划两块。'),
        h('div', { className: 'sf-card' },
          h('strong', null, '已绑定需求'),
          h('p', null, run.spec.fields.goal || '还没有需求正文'),
          h('p', null, '必须保留：' + (run.spec.fields.preserve || '未写'))),
        Banner(run.plan.status === 'invalid' ? 'bad' : 'note', run.plan.status === 'invalid' ? ('旧计划已失效：' + (run.plan.invalidReason || '')) : ('计划 v' + run.plan.version + ' · ' + run.plan.status)),
        Field('对既有行为的影响（重构或行为变化时必填）', impact, setImpact, true),
        Field('任务 JSON：id、title、intent、files、dependsOn、acceptanceIds、verifyCommands、notesToLoad', tasksText, setTasks, true),
        parseError ? h('div', { className: 'sf-banner bad' }, parseError) : null,
        Actions([
          Btn({ disabled: busy, onClick: save }, '保存计划草稿'),
          Btn({ primary: true, disabled: busy, onClick: () => save().then((result) => { if (result && result.ok) return runCall('approvePlan') }) }, '批准计划版本'),
          projection.can.confirmSmall ? Btn({ disabled: busy, onClick: () => save().then((result) => { if (result && result.ok) return runCall('confirmSmallChange') }) }, '小改：一次确认需求和计划') : null,
        ]))
    }

    function DevelopScreen(run, projection, runCall, busy, log, setLog) {
      const task = projection.currentTask
      const [diff, setDiffText] = React.useState(run.diff || '')
      const [summary, setSummary] = React.useState(run.developerSummary || '')
      const [acceptanceId, setAcceptance] = React.useState(task ? task.acceptanceIds[0] : '')
      const [result, setResult] = React.useState('pass')
      const [klass, setKlass] = React.useState('introduced')
      const [output, setOutput] = React.useState('')
      const evidenceRows = task && task.runtime && task.runtime.evidence.length
        ? h('table', null, h('tbody', null, task.runtime.evidence.map((item, index) => h('tr', { key: index },
          h('td', null, item.acceptanceId),
          h('td', null, item.result),
          h('td', null, item.klass || '-')))))
        : h('p', null, '还没有验证记录。')
      const taskCards = task
        ? h('div', { className: 'sf-grid two' },
          h('div', { className: 'sf-card' },
            h('h3', null, '当前任务 ' + task.id + ' ' + task.title),
            h('p', null, task.intent),
            h('div', { className: 'sf-label' }, '允许修改的文件'),
            h('ul', null, task.files.map((file) => h('li', { key: file }, h('code', null, file)))),
            h('p', null, '自动返修 ' + (task.runtime ? task.runtime.reworkRounds : 0) + ' / ' + run.defaults.maxReworkRounds)),
          h('div', { className: 'sf-card' },
            h('h3', null, '验证结果'),
            evidenceRows))
        : Banner('ok', '计划内任务都已完成。补上真实 diff 后才能送审。')
      const verifyForm = task
        ? h('div', { className: 'sf-grid two' },
          h('label', null, h('span', null, '验收项'), h('select', { value: acceptanceId, onChange: (event) => setAcceptance(event.target.value) },
            (task.acceptanceIds || []).map((id) => h('option', { key: id, value: id }, id)))),
          h('label', null, h('span', null, '结果'), h('select', { value: result, onChange: (event) => setResult(event.target.value) },
            h('option', { value: 'pass' }, '通过'),
            h('option', { value: 'fail' }, '失败'),
            h('option', { value: 'uncovered' }, '尚未覆盖'))),
          result === 'fail'
            ? h('label', null, h('span', null, '失败分类'), h('select', { value: klass, onChange: (event) => setKlass(event.target.value) },
              h('option', { value: 'env' }, '环境故障'),
              h('option', { value: 'preexisting' }, '原有失败'),
              h('option', { value: 'introduced' }, '本次引入')))
            : null,
          Field('输出摘要', output, setOutput, true))
        : null
      return h('section', null,
        h('h1', null, '开发与自验'),
        h('p', { className: 'sf-lede' }, '按已批准且未失效的计划串行执行。范围外文件会被拒绝。不能靠删除或弱化测试求得通过。'),
        Banner('note', projection.shellPolicy === 'exact-verify'
          ? 'shell 只放行与当前任务验证命令完全相同的 bash/pwsh。这不是路径沙箱。'
          : ('shell 策略：' + projection.shellPolicy)),
        taskCards,
        verifyForm,
        Field('真实 diff', diff, setDiffText, true),
        Field('开发总结（只留在工作台，不会交给评审）', summary, setSummary, true),
        h('button', { className: 'sf-btn', onClick: () => setLog(!log) }, log ? '收起详细日志' : '显示详细日志'),
        h('pre', { className: 'sf-log' + (log ? ' show' : '') }, (run.events || []).map((event) => event.type + ' ' + event.detail).join('\n')),
        Actions([
          task ? Btn({ disabled: busy, onClick: () => runCall('recordVerification', {
            taskId: task.id, acceptanceId, result, klass: result === 'fail' ? klass : null, command: (task.verifyCommands || [])[0] || '', output,
          }) }, '记录验证') : null,
          task ? Btn({ disabled: busy, onClick: () => runCall('completeCurrentTask') }, '完成当前任务') : null,
          Btn({ disabled: busy, onClick: () => runCall('setDiff', { diff }).then(() => runCall('setDeveloperSummary', { summary })) }, '保存 diff'),
          Btn({ primary: true, disabled: busy, onClick: () => runCall('setDiff', { diff }).then(() => runCall('submitReview')) }, '送独立评审'),
          Btn({ disabled: busy, onClick: () => runCall('reportBlock', { reason: 'scope', detail: '开发想扩大已确认范围。' }) }, '报告范围扩大并暂停'),
        ]))
    }

    function BlockedScreen(run, runCall, busy) {
      const block = run.block || { reason: '', detail: '' }
      const [minutes, setMinutes] = React.useState('30')
      const [rounds, setRounds] = React.useState(String((run.defaults.maxReworkRounds || 2) + 1))
      return h('section', null,
        h('h1', null, '阻断 · 等你决定'),
        Banner('bad', block.detail || '系统不能自行继续。'),
        h('p', null, '原因：' + block.reason + '。已做的改动会保留。'),
        block.reason === 'budget' ? Field('追加分钟数', minutes, setMinutes) : null,
        block.reason === 'rework' ? Field('新的自动返修上限', rounds, setRounds) : null,
        Actions([
          block.reason === 'budget' ? Btn({ disabled: busy, onClick: () => runCall('extendBudget', { minutes: Number(minutes) }) }, '追加时间') : null,
          block.reason === 'rework' ? Btn({ disabled: busy, onClick: () => runCall('raiseReworkCap', { rounds: Number(rounds) }) }, '提高返修上限') : null,
          Btn({ primary: true, disabled: busy, onClick: () => runCall('resolveBlock', { action: 'continue' }) }, '按原范围继续'),
          Btn({ disabled: busy, onClick: () => runCall('resolveBlock', { action: 'revise' }) }, '改需求并重确认'),
          Btn({ danger: true, disabled: busy, onClick: () => runCall('resolveBlock', { action: 'cancel' }) }, '取消运行'),
        ]))
    }

    function ReviewScreen(run, runCall, busy) {
      const [preset, setPreset] = React.useState(run.runtimeConfig.reviewAgentPreset || '')
      const [provider, setProvider] = React.useState(run.runtimeConfig.subagentProvider || 'spawn')
      const [sessionId, setSession] = React.useState(run.runtimeConfig.sessionId || '')
      return h('section', null,
        h('h1', null, '独立评审'),
        h('p', { className: 'sf-lede' }, '对照已批准的需求和计划、真实 diff、验证证据。不采信开发总结。未通过不能进入验收。'),
        Banner(run.review.status === 'passed' ? 'ok' : 'warn', '评审状态：' + run.review.status + (run.review.findings ? '。' + run.review.findings : '')),
        h('pre', { className: 'sf-log show' }, run.diff || '没有 diff'),
        Field('子会话 provider（文档示例是 spawn，本环境未验证）', provider, setProvider),
        Field('reviewAgentPreset（必须是不继承父上下文的已有预设）', preset, setPreset),
        Field('父会话 id', sessionId, setSession),
        Actions([
          Btn({ disabled: busy, onClick: () => runCall('setRuntimeConfig', { subagentProvider: provider, reviewAgentPreset: preset, sessionId }) }, '保存评审配置'),
          Btn({ primary: true, disabled: busy, onClick: () => runCall('setRuntimeConfig', { subagentProvider: provider, reviewAgentPreset: preset, sessionId }).then(() => runCall('dispatchReview')) }, '派发独立评审'),
        ]))
    }

    function AcceptScreen(run, projection, runCall, busy) {
      const rows = []
      for (const task of run.plan.tasks || []) {
        const runtime = run.taskRuntime[task.id]
        const latest = new Map()
        for (const item of (runtime && runtime.evidence) || []) latest.set(item.acceptanceId, item)
        for (const id of task.acceptanceIds) {
          const item = latest.get(id)
          rows.push(h('tr', { key: id },
            h('td', null, id),
            h('td', null, item ? (item.command || item.output || '有记录') : '没有证据'),
            h('td', null, run.review.status),
            h('td', null, item && item.result === 'pass' ? '已验证' : '未作为通过')))
        }
      }
      return h('section', null,
        h('h1', null, '用户验收'),
        h('p', { className: 'sf-lede' }, '请按验收项看证据。测试通过不能替代你的验收。验收通过后，提交、推送、合并、发布仍分成四次确认。'),
        h('table', null, h('tbody', null, rows)),
        Actions([
          Btn({ primary: true, disabled: busy || !projection.can.accept, onClick: () => runCall('accept') }, '验收通过'),
        ]))
    }

    function ReleaseScreen(run, projection, runCall, busy) {
      const step = run.phase
      const copy = {
        commit: ['待确认提交', '这一步只表示你同意在本地创建提交。工厂不会执行 git commit。'],
        push: ['待确认推送', '这一步只表示你同意推送。它不会代替提交，工厂也不会执行 git push。'],
        merge: ['待确认合并', '这一步只表示你同意合并。工厂不会合并拉取请求。'],
        release: ['待确认发布', '这一步只表示你同意发布。工厂不会打 tag，也不会发到插件市场。'],
        done: ['已完成', '四次确认都已单独记录。工作区没有被工厂清理。'],
      }
      const pair = copy[step] || copy.done
      return h('section', null,
        h('h1', null, pair[0]),
        h('p', { className: 'sf-lede' }, pair[1]),
        h('ul', null,
          h('li', null, '提交：' + (run.release.commit ? '已单独确认' : '未确认')),
          h('li', null, '推送：' + (run.release.push ? '已单独确认' : '未确认')),
          h('li', null, '合并：' + (run.release.merge ? '已单独确认' : '未确认')),
          h('li', null, '发布：' + (run.release.release ? '已单独确认' : '未确认'))),
        Actions([
          Btn({ primary: true, disabled: busy || !projection.can.confirmCommit, onClick: () => runCall('confirmRelease', { step: 'commit' }) }, '确认提交'),
          Btn({ primary: true, disabled: busy || !projection.can.confirmPush, onClick: () => runCall('confirmRelease', { step: 'push' }) }, '确认推送'),
          Btn({ primary: true, disabled: busy || !projection.can.confirmMerge, onClick: () => runCall('confirmRelease', { step: 'merge' }) }, '确认合并'),
          Btn({ primary: true, disabled: busy || !projection.can.confirmRelease, onClick: () => runCall('confirmRelease', { step: 'release' }) }, '确认发布'),
        ]))
    }

    function RecordsScreen(run) {
      return h('section', null,
        h('h1', null, '记录'),
        h('p', { className: 'sf-lede' }, '恢复时只沿用已批准且未失效的版本。范围没变的已完成任务不会重做。'),
        h('ul', null, (run.events || []).slice().reverse().map((event, index) => h('li', { key: index }, event.type + ' · ' + event.detail))))
    }

    function FactoryIcon() {
      return h('span', { style: { width: 16, height: 16, borderRadius: 4, background: '#1f6feb', color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: 10, fontWeight: 700 } }, '厂')
    }

    function apply(ctx) {
      const slots = ctx.get ? ctx.get('slots') : ctx.slots
      if (!slots || typeof slots.inject !== 'function') return
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-software-factory'
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => { tag.remove() }
      })
      slots.inject('sidebar.panellist', () => slots.register({
        name: 'sidebar.panellist',
        id: 'software-factory',
        order: 40,
        label: '软件工厂',
      }, FactoryIcon))
      slots.inject('main', () => slots.register({
        name: 'main',
        key: 'software-factory',
      }, Workbench))
    }

    return { name: 'software-factory', inject, apply }
  },
})
