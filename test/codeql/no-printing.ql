/**
 * @name Console.log in Command action handler
 * @description Finds undesired prints to stdout/stderr inside command .action() callbacks.
 * @kind problem
 * @problem.severity warning
 * @id js/console-log-in-command-action
 */

import javascript

predicate isActionHandler(Function f) {
  exists(CallExpr actionCall |
    actionCall.getCalleeName() = "action" and
    f = actionCall.getArgument(0).(Function)
  )
}

predicate isConsoleCall(CallExpr call) {
  call.getReceiver().(VarAccess).getName() = "console"
}

predicate isProcessStreamWrite(CallExpr call) {
  exists(DotExpr recv |
    recv = call.getReceiver() and
    call.getCalleeName() = "write" and
    recv.getPropertyName() = ["stdout", "stderr"] and
    recv.getBase().(VarAccess).getName() = "process"
  )
}

from Function actionHandler, CallExpr printCall
where
  isActionHandler(actionHandler) and
  printCall.getEnclosingFunction+() = actionHandler and
  (isConsoleCall(printCall) or isProcessStreamWrite(printCall)) and
  not printCall.getFile().getBaseName() = ["factory.ts", "factory-core.ts", "cli.ts"]
select printCall, "Direct printing should not be used inside a Command .action() handler."
