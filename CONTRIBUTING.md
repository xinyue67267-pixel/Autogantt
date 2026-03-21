# 贡献与开发规范（强制）

## 文档一致性

- 任何实现层面的变更（字段/交互/权限/同步策略等）必须同步更新：
  - `.trae/documents/PRD.md`
  - `.trae/documents/Technical_Architecture.md`
  - `.trae/documents/UI_Design.md`

## 最小化改动原则

- 仅修改实现需求必需的代码，不做冗余改动。

## 注释规范

- 生成代码时：文件头、函数/方法、条件判断、循环逻辑必须添加JSDoc，说明参数、返回值、逻辑目的。
- 生成配置、schema时：尽可能逐行添加注释，说明作用与可选项。
- 生成关系型数据库DDL时：必须为表与字段写入中文COMMENT。

## 需先确认的高风险操作

除非需求明确要求，否则以下操作执行前必须先获得确认：

- 变更数据库结构（新增表/改字段/删表）
- 调整接口结构（路径/请求参数/响应格式）
- 清除数据表数据（不论数据量大小）

## 仓库卫生

- 临时工具脚本、测试数据、调试log等不应提交；需加入`.gitignore`。
- 预提交会执行文件检查，发现典型临时/二进制产物将阻止提交。

## 提交规范（Conventional Commits）

- 提交信息必须符合Conventional Commits（由commit-msg钩子校验）。
- 每次提交前必须通过质量门禁（见下）。

## 质量门禁（提交前必须通过）

- ESLint：`npm run lint`
- Prettier：`npm run format:check`
- TypeScript：`npm run typecheck`
- 聚合：`npm run check`

## 版本与日志（会话结束强制）

- 每次会话结束必须升级`package.json`版本（minor）。
- 提交前必须更新`history.md`，按模板追加：
  - `#版本（#日期) #一句话简要说明改动内容`
