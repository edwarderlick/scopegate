/**
 * Deployment Source Validator
 * Validates that the submitted Python source declares the expected GenLayer Intelligent Contract.
 * Accepts both `class ScopeGate(gl.contract.Contract)` and `class ScopeGate(gl.Contract)`.
 */
export function validateContractSource(source: string): void {
  if (
    !source.includes('class ScopeGate(gl.contract.Contract)') &&
    !source.includes('class ScopeGate(gl.Contract)')
  ) {
    throw new Error('Selected file does not look like contracts/scopegate.py.');
  }
}
