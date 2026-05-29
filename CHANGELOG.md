# Changelog

## [0.2.0](https://github.com/elastic/cli/compare/v0.1.1...v0.2.0) (2026-05-29)


### Features

* **cli:** Add elastic status command to verify connectivity and auth ([#362](https://github.com/elastic/cli/issues/362)) ([0f1a63f](https://github.com/elastic/cli/commit/0f1a63fb9f594c45d6db5275af936279fb071623))
* **cli:** Add root version flag ([#334](https://github.com/elastic/cli/issues/334)) ([c2557bf](https://github.com/elastic/cli/commit/c2557bf1e50b34ecb0952c10891e38ee994a0b3f))
* **cli:** Add shell completion for bash, zsh, and fish ([#354](https://github.com/elastic/cli/issues/354)) ([e4afc32](https://github.com/elastic/cli/commit/e4afc32ab8e849bc9a802d49ae584cf583e4b91a))
* Emit CLI structure as argh-schema JSON via `elastic cli-schema` ([#359](https://github.com/elastic/cli/issues/359)) ([9e0371c](https://github.com/elastic/cli/commit/9e0371c81d19f7e05329d9178592da6554b04ccb))
* **es:** Replace @elastic/transport with native fetch EsClient ([#281](https://github.com/elastic/cli/issues/281)) ([929ddd4](https://github.com/elastic/cli/commit/929ddd44ad88def8f0d7b5b4b5816befc9fc7f5d))
* **extension:** Add extension registry store module ([#299](https://github.com/elastic/cli/issues/299)) ([f42593e](https://github.com/elastic/cli/commit/f42593e6bccb8e3f27141e205315cd8bafd693bc))


### Bug Fixes

* Cat APIs were casting JSON objects to string instead of printing text ([#358](https://github.com/elastic/cli/issues/358)) ([04edbe7](https://github.com/elastic/cli/commit/04edbe7a00b86c8fafd194040b5f95dce89e00c4))
* **cli:** Bundle zod to fix `npm install -g` first-run failure ([#340](https://github.com/elastic/cli/issues/340)) ([b8e7280](https://github.com/elastic/cli/commit/b8e728080af7afe888609fb86c9ec2c1d85c0756))
* **codegen:** Wire upstream cli-serverless into cloud codegen ([#355](https://github.com/elastic/cli/issues/355)) ([afe1c35](https://github.com/elastic/cli/commit/afe1c355da1e9e5af815db7e8307a8981bb79c2e))
* **config:** Dedupe inline secret warning ([#364](https://github.com/elastic/cli/issues/364)) ([df9fd5d](https://github.com/elastic/cli/commit/df9fd5dd5dec58cb40e21371565a0a7b9fec775b))
* **deps:** Update dependency yaml to v2.8.4 ([#322](https://github.com/elastic/cli/issues/322)) ([39410e2](https://github.com/elastic/cli/commit/39410e2293e1f8152478e2861aa54608b0cd190f))
* **deps:** Update dependency yaml to v2.9.0 ([#368](https://github.com/elastic/cli/issues/368)) ([a1f9e18](https://github.com/elastic/cli/commit/a1f9e18cb72aefb5af984a6d88ec520667550403))
* **deps:** Update dependency zod to v4.4.3 ([#320](https://github.com/elastic/cli/issues/320)) ([f787796](https://github.com/elastic/cli/commit/f787796834473ca56ba8c1f561e245f6aa643113))
* Duplicate NDJSON content type in bulk ingest ([#363](https://github.com/elastic/cli/issues/363)) ([4cd0970](https://github.com/elastic/cli/commit/4cd09708fa9d4fce170b8007a611f27eba41b903))
* **es:** Accept array _source in search bodies ([#370](https://github.com/elastic/cli/issues/370)) ([51b4bfe](https://github.com/elastic/cli/commit/51b4bfeba9d082cc3edd5fec4fd4683ae6d852be))
* **es:** Full support for shortcut properties ([#372](https://github.com/elastic/cli/issues/372)) ([a72d0bb](https://github.com/elastic/cli/commit/a72d0bb071f86466b4ccb4c2778cffcbd008c3db))
* **es:** Parse --sort &lt;field&gt;:&lt;direction&gt; for body-routed Sort args ([#350](https://github.com/elastic/cli/issues/350)) ([ce0e76a](https://github.com/elastic/cli/commit/ce0e76a042528d565cb71599ad48fd4dcbc385c6)), closes [#330](https://github.com/elastic/cli/issues/330)
* **factory:** Preserve optionality on JSON body field relaxation ([#349](https://github.com/elastic/cli/issues/349)) ([617e035](https://github.com/elastic/cli/commit/617e035aa089ad3f7ebbe9afa2d7180b13f9b588))
* **factory:** Support '-' as stdin sentinel for --input-file ([#337](https://github.com/elastic/cli/issues/337)) ([ad970e0](https://github.com/elastic/cli/commit/ad970e0ab75ec6bb145d09352defb9a286c9c948))
* Flush full JSON schema when stdout is a pipe ([#375](https://github.com/elastic/cli/issues/375)) ([5ac7b5c](https://github.com/elastic/cli/commit/5ac7b5caa8319a09fd67b70be7699e45fb117473))
* **output:** Allow literal-dotted keys in --output-fields paths ([#336](https://github.com/elastic/cli/issues/336)) ([aecf689](https://github.com/elastic/cli/commit/aecf689de6272f871151b6dd8cbce9d6c7414c0e))
* **output:** Error on templated primitives, flip cat APIs to JSON ([#327](https://github.com/elastic/cli/issues/327)) ([#353](https://github.com/elastic/cli/issues/353)) ([da808d8](https://github.com/elastic/cli/commit/da808d89a26c36791a2997f1694961b3c9e534f9))
* **output:** Project --output-fields across array nodes ([#338](https://github.com/elastic/cli/issues/338)) ([28a7a73](https://github.com/elastic/cli/commit/28a7a73f04a1b11e93fdf7a887a9d32d514d7b43))
* Respect --json flag on --help for root and groups ([#373](https://github.com/elastic/cli/issues/373)) ([2297c98](https://github.com/elastic/cli/commit/2297c98d8d78f6e416230e7bf410998eaa9969d1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @elastic/es-schemas bumped from 1.0.1 to 1.0.2

## [0.1.1](https://github.com/elastic/cli/compare/v0.1.0...v0.1.1) (2026-05-13)


### Bug Fixes

* Bundle workspace deps and add config-resolver to release-please ([#309](https://github.com/elastic/cli/issues/309)) ([39d98c5](https://github.com/elastic/cli/commit/39d98c5666ef5e63cc37c3bc1c7516b1fb3f543b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @elastic/es-schemas bumped from * to 1.0.1

## 0.1.0 (2026-05-11)


### Features

* `elastic config` command group + credential-safe project create ([#216](https://github.com/elastic/cli/issues/216)) ([fd337ed](https://github.com/elastic/cli/commit/fd337ed01d95c1981f1878bc9589b8bbc462ffa9))
* Add --fields and --template flags for output control ([#220](https://github.com/elastic/cli/issues/220)) ([99f9ebe](https://github.com/elastic/cli/commit/99f9ebe80e5a11a6039e7dc4211d6194207036bb))
* Add bulk-ingest helper command ([#119](https://github.com/elastic/cli/issues/119)) ([422f2e3](https://github.com/elastic/cli/commit/422f2e3cee57cf5b4546744a77cdb70023ddc117))
* Add elastic docs commands (search, ask, chat, read) ([#147](https://github.com/elastic/cli/issues/147)) ([fd447b1](https://github.com/elastic/cli/commit/fd447b18034ff7363c805d9fb7a88cce13637fa0))
* Add external credential resolvers for config values ([#143](https://github.com/elastic/cli/issues/143)) ([e8d98a0](https://github.com/elastic/cli/commit/e8d98a060777d72f71d37e2aa2cb497a99f49e5d))
* Add helper commands foundation ([#118](https://github.com/elastic/cli/issues/118)) ([1761707](https://github.com/elastic/cli/commit/1761707370c56a45c84f7e9f73571c202f5d4916))
* Add msearch helper command ([#127](https://github.com/elastic/cli/issues/127)) ([59e7691](https://github.com/elastic/cli/commit/59e7691959f8e327f6b89a92adb48967cd367c63))
* Add scroll-search helper command ([#123](https://github.com/elastic/cli/issues/123)) ([21573db](https://github.com/elastic/cli/commit/21573db554d69c911b5742ce529c6613f004932c))
* Add secret_service, pass, and credential_manager resolvers ([#152](https://github.com/elastic/cli/issues/152)) ([92e6982](https://github.com/elastic/cli/commit/92e6982a4e5d36f558499595cacde3fd9883bc56))
* **bulk-ingest:** Add CSV input support via --source-format csv ([#286](https://github.com/elastic/cli/issues/286)) ([ef46af6](https://github.com/elastic/cli/commit/ef46af6d2d862d27642ba9424bef914dcb4f12ca))
* Command profiles for deployment-aware API surface filtering ([#284](https://github.com/elastic/cli/issues/284)) ([c3a7226](https://github.com/elastic/cli/commit/c3a7226a3cedaa956ceba364235d0e5dd1eb6616))
* Es-schema module poc  ([#232](https://github.com/elastic/cli/issues/232)) ([61ba1d8](https://github.com/elastic/cli/commit/61ba1d893b5047c27921137f42e798d3a5be61fe))
* **es:** Group top-level commands by domain in help output ([#221](https://github.com/elastic/cli/issues/221)) ([#288](https://github.com/elastic/cli/issues/288)) ([ca5bd83](https://github.com/elastic/cli/commit/ca5bd83987405dd92ee9451bcd8f6b7278287750))
* **helpers:** Add watch command to stream new documents from an index ([#255](https://github.com/elastic/cli/issues/255)) ([#289](https://github.com/elastic/cli/issues/289)) ([b0c8952](https://github.com/elastic/cli/commit/b0c89529857f026249dd3dd781e964f6fb83a0d7))
* Implement elastic sanitize command  ([#233](https://github.com/elastic/cli/issues/233)) ([b4b5ab7](https://github.com/elastic/cli/commit/b4b5ab744a6582f17638d926b573843099eef0f5))
* **kb:** Add Kibana API support with generated command definitions ([#195](https://github.com/elastic/cli/issues/195)) ([adf5b45](https://github.com/elastic/cli/commit/adf5b4505ec5f46040e4e8dd43a407a54bb25ed7))
* **kb:** Add kibana functional tests ([#279](https://github.com/elastic/cli/issues/279)) ([adb6cc7](https://github.com/elastic/cli/commit/adb6cc7a851926ae63c41cc69616ffadf3f10bf5))
* Lazy validation, only resolve expressions for the active context ([#148](https://github.com/elastic/cli/issues/148)) ([77dbd5f](https://github.com/elastic/cli/commit/77dbd5fc7266322ec487ec642965e23b4a8c00a5))
* Namespace restructure per UX proposal ([#229](https://github.com/elastic/cli/issues/229)) ([#282](https://github.com/elastic/cli/issues/282)) ([2e4b877](https://github.com/elastic/cli/commit/2e4b87704f1dc1e68ae90c7280ff8153192be27a))
* Startup banner with Elastic brand colors ([#256](https://github.com/elastic/cli/issues/256)) ([bc6e83a](https://github.com/elastic/cli/commit/bc6e83a25f46091a1c58a75c92e4be5f78e16d9c))


### Bug Fixes

* --input-file should work in non-TTY contexts ([#121](https://github.com/elastic/cli/issues/121)) ([c7e2387](https://github.com/elastic/cli/commit/c7e2387415bbdb4fcb8f0f5008dd8190763addd7))
* Autogenerated code to allow passthrough schemas to prevent Zod field stripping ([#159](https://github.com/elastic/cli/issues/159)) ([1b91960](https://github.com/elastic/cli/commit/1b919602b484d4cf30bf1503cd04f1d925fe7ce4))
* Buffer chunks and return JSON in ask --json mode ([3d14be9](https://github.com/elastic/cli/commit/3d14be96d06af4c90f42642bb9489aa6a51964b0))
* Buffer chunks and return JSON in chat --json mode ([ad620e3](https://github.com/elastic/cli/commit/ad620e3f1b29bbcffbe0749a8a73cb18ed333982))
* Buffer scroll-search documents into single JSON object when --json is active ([#207](https://github.com/elastic/cli/issues/207)) ([d2b4a43](https://github.com/elastic/cli/commit/d2b4a43e599b4bb7dc51e23befdf0173493c70c1))
* Cache early config load to avoid redundant double load ([#206](https://github.com/elastic/cli/issues/206)) ([c32e235](https://github.com/elastic/cli/commit/c32e23516786d45c0311415239389aa2215080c6))
* **ci:** Replace npm install with npm ci in all workflows ([#257](https://github.com/elastic/cli/issues/257)) ([c6beb33](https://github.com/elastic/cli/commit/c6beb33aab17716455f684a85b44c2189992e27f)), closes [#238](https://github.com/elastic/cli/issues/238)
* **ci:** Scope workflow permissions to minimum per-job (ECLI-004) ([#259](https://github.com/elastic/cli/issues/259)) ([df40134](https://github.com/elastic/cli/commit/df401344ff95beee08eb0fdc29bc49425082d809)), closes [#241](https://github.com/elastic/cli/issues/241)
* **codegen:** Emit --json instead of unsupported --format=json ([#194](https://github.com/elastic/cli/issues/194)) ([e6dabee](https://github.com/elastic/cli/commit/e6dabee788f8675b9316a92a8eb66b33bc089e5b)), closes [#192](https://github.com/elastic/cli/issues/192)
* **codegen:** Emit no-op in teardown when every step is skipped ([#190](https://github.com/elastic/cli/issues/190)) ([9245d80](https://github.com/elastic/cli/commit/9245d8080fc8bf6b57550f6bff9067c99f0016d5)), closes [#188](https://github.com/elastic/cli/issues/188)
* **codegen:** Skip assertions that depend on an unmapped do-step ([#191](https://github.com/elastic/cli/issues/191)) ([91c8e34](https://github.com/elastic/cli/commit/91c8e347def8276cccf1368beada76f5010669c0)), closes [#189](https://github.com/elastic/cli/issues/189)
* Ensure global options can appear in any order ([#113](https://github.com/elastic/cli/issues/113)) ([a49b6c0](https://github.com/elastic/cli/commit/a49b6c0910454ba6d2d95bf67701d5a084c51cef))
* Es functional tests ([#196](https://github.com/elastic/cli/issues/196)) ([adefd3a](https://github.com/elastic/cli/commit/adefd3a4f2f009fb2c8554c00445fb6834db9e58))
* Handle repeated CLI flags instead of silently dropping values ([#126](https://github.com/elastic/cli/issues/126)) ([7617c57](https://github.com/elastic/cli/commit/7617c5771d6516dc33a70cae45fa0988ce17521a))
* Incorrect elastic config set suggestion in missing config error ([#129](https://github.com/elastic/cli/issues/129)) ([3da66c7](https://github.com/elastic/cli/commit/3da66c705d939c4ccd9a02a2e73363099c15e37c))
* Keep NOTICE.txt accurate in Renovate PRs and local dev ([#252](https://github.com/elastic/cli/issues/252)) ([#287](https://github.com/elastic/cli/issues/287)) ([362497f](https://github.com/elastic/cli/commit/362497fc3578823ffee80cf452c194927bfd47b6))
* Only allow static config file types ([#114](https://github.com/elastic/cli/issues/114)) ([e7c01b8](https://github.com/elastic/cli/commit/e7c01b88966f2abbc71946a65e5807502bb73631))
* Parsing/destructuring command inputs  ([#130](https://github.com/elastic/cli/issues/130)) ([b8fe57d](https://github.com/elastic/cli/commit/b8fe57d65a7ea7929dbd02e60da83af0455ed1bb))
* Pass cat text responses through without extra newline ([#268](https://github.com/elastic/cli/issues/268)) ([0542d07](https://github.com/elastic/cli/commit/0542d073179dce4d7f76efe84c71f63878665618))
* Pin jq ver in ci ([#209](https://github.com/elastic/cli/issues/209)) ([32ce18b](https://github.com/elastic/cli/commit/32ce18bb73e06c13e966b208e1aa680157be2c4c))
* Print human-readable output for --dry-run without --json ([#117](https://github.com/elastic/cli/issues/117)) ([6763b98](https://github.com/elastic/cli/commit/6763b9805366ce9e197dd490680e9496ec7e0678))
* Render API errors as human-readable messages in text mode ([#153](https://github.com/elastic/cli/issues/153)) ([31ba9bd](https://github.com/elastic/cli/commit/31ba9bd3308fa5e86286e00c543b26691397eb49))
* Restrict config discovery to home directory only ([#142](https://github.com/elastic/cli/issues/142)) ([15435a8](https://github.com/elastic/cli/commit/15435a88ed621440a892ff1e8579a6da80792538))
* Return structured JSON from docs ask/chat when --json is active ([#202](https://github.com/elastic/cli/issues/202)) ([3a5ac96](https://github.com/elastic/cli/commit/3a5ac9607d341ca8fd45e3f3b040a990ee975cac))
* Split CSV into arrays for body-routed union fields ([#167](https://github.com/elastic/cli/issues/167)) ([#214](https://github.com/elastic/cli/issues/214)) ([f6a60f4](https://github.com/elastic/cli/commit/f6a60f428d79976561565dde44dced25ecb68791))
* Surface all config loading errors in preAction hook ([#124](https://github.com/elastic/cli/issues/124)) ([4d10966](https://github.com/elastic/cli/commit/4d10966fc4ec85572403ca647d725b57d20bd4f6))
* Surface best-matching variant for union validation errors ([#172](https://github.com/elastic/cli/issues/172)) ([#213](https://github.com/elastic/cli/issues/213)) ([9bfd3b0](https://github.com/elastic/cli/commit/9bfd3b0ab652441b4e38a04129ade111d91eb751))
* Surface meaningful error messages for connection failures ([#122](https://github.com/elastic/cli/issues/122)) ([844eb0b](https://github.com/elastic/cli/commit/844eb0ba466bca05fea4e9c1a088393138bacc8c))
* Update readme, cloud bugs ([#131](https://github.com/elastic/cli/issues/131)) ([8004b93](https://github.com/elastic/cli/commit/8004b9383ba350c2ba30d2cd0fead78cd74bdd97))
* Use passthrough instead of strict for input schemas  ([#223](https://github.com/elastic/cli/issues/223)) ([edd0609](https://github.com/elastic/cli/commit/edd06091e3b79de7a2f6ef31421b9702a2f337eb))
* Use POST instead of PUT for es index when --id is absent ([#203](https://github.com/elastic/cli/issues/203)) ([ec02393](https://github.com/elastic/cli/commit/ec0239360c90f3a411f9f1bcb49ca78daa502c57))
* Use URL parser for loopback check in HTTP clients ([#267](https://github.com/elastic/cli/issues/267)) ([88bee47](https://github.com/elastic/cli/commit/88bee4718b6f0fb647ac3496deae84042e7bae06))
* Validate required schema fields when no input is provided ([#125](https://github.com/elastic/cli/issues/125)) ([6ace544](https://github.com/elastic/cli/commit/6ace544ffcc9d9575d8de43d10e4f051b46bd2ac))
* Wrap scroll-search --query value under "query" in request body ([#215](https://github.com/elastic/cli/issues/215)) ([60e9c45](https://github.com/elastic/cli/commit/60e9c450b5120f5a8a6c6e69f830cdb47a9d29a4)), closes [#169](https://github.com/elastic/cli/issues/169)
* Write error results to stderr and exit non-zero ([#120](https://github.com/elastic/cli/issues/120)) ([ff7beca](https://github.com/elastic/cli/commit/ff7becafd1aa0ff152cae17538f57956283a6ec4))


### Performance Improvements

* **es:** Lazy-load ES schemas per endpoint to cut startup heap ([#171](https://github.com/elastic/cli/issues/171)) ([#218](https://github.com/elastic/cli/issues/218)) ([e57920d](https://github.com/elastic/cli/commit/e57920dbd8667d65aa6dc17b03bb5136c3cf3b06))
* **es:** Warn when --json is used with unbounded --max-docs in scroll-search ([#249](https://github.com/elastic/cli/issues/249)) ([9cfa147](https://github.com/elastic/cli/commit/9cfa147f941354691fc27f9755b81baafc1098a1))
* **kb:** Lazy-load KB schemas per namespace/endpoint ([#251](https://github.com/elastic/cli/issues/251)) ([#266](https://github.com/elastic/cli/issues/266)) ([1197e58](https://github.com/elastic/cli/commit/1197e58d6423a9b6ad67cf027bb5e857a573924a))


### Reverts

* Remove config cache fix (will re-land as PR [#163](https://github.com/elastic/cli/issues/163)) ([916006e](https://github.com/elastic/cli/commit/916006eeab9675a426424c1c903a6f6949281a89))
* Remove docs ask/chat --json buffer commits (will re-land as PR) ([59c7a18](https://github.com/elastic/cli/commit/59c7a18f666644bcb804066752e213886c204da9))
* Remove index PUT/POST fix (will re-land as PR [#168](https://github.com/elastic/cli/issues/168)) ([b594e25](https://github.com/elastic/cli/commit/b594e25dcb7324dde493d1178426d8247cf9211f))
