/**
 * @name Custom Command instead of factory
 * @description Finds commands created with `new Command()` that register options or actions directly instead of using the factory.
 * @kind problem
 * @problem.severity warning
 * @id js/no-custom-command
 */

import javascript

/**
 * Command names that are permitted to bypass the factory.
 */
predicate isAllowlisted(string name) {
  name = ["version", "completion", "elastic", "__complete"]
}

/**
 * A `new Command('name')` expression.
 */
class NewCommandExpr extends NewExpr {
  NewCommandExpr() {
    this.getCalleeName() = "Command" and
    this.getNumArgument() >= 1
  }

  string getCommandName() {
    result = this.getArgument(0).getStringValue()
  }
}

/**
 * A method call on a variable that was assigned from `new Command(...)`.
 */
predicate isMethodOnCommand(NewCommandExpr cmd, MethodCallExpr methodCall) {
  exists(VarDef def, VarAccess access |
    def.getSource() = cmd and
    access.getVariable() = def.getTarget().(VarRef).getVariable() and
    methodCall.getReceiver() = access
  )
  or
  // Chained: new Command('...').option(...) / new Command('...').action(...)
  methodCall.getReceiver() = cmd
  or
  // Chained off another method on the same command: new Command('...').option(...).action(...)
  exists(MethodCallExpr prior |
    isMethodOnCommand(cmd, prior) and
    methodCall.getReceiver() = prior
  )
}

from NewCommandExpr cmd, MethodCallExpr methodCall
where
  isMethodOnCommand(cmd, methodCall) and
  methodCall.getMethodName() = ["option", "action"] and
  not isAllowlisted(cmd.getCommandName()) and
  not cmd.getFile().getRelativePath().matches("test/%")
select cmd, "Custom command '" + cmd.getCommandName() + "' should use the factory instead of manual Command construction."
