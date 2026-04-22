import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

let diagnosticCollection: vscode.DiagnosticCollection;

interface LintDiagnostic {
  severity: 'error' | 'warning';
  source: string;
  field: string;
  message: string;
  line?: number;
}

interface LintResult {
  valid: boolean;
  file: string;
  diagnostics: LintDiagnostic[];
}

export function activate(context: vscode.ExtensionContext) {
  // Create diagnostic collection
  diagnosticCollection = vscode.languages.createDiagnosticCollection('guidemd');
  context.subscriptions.push(diagnosticCollection);

  // Check if workspace has GUIDE.md
  checkForGuideMd();

  // Register commands
  const openDashboardCommand = vscode.commands.registerCommand('guidemd.openDashboard', openDashboard);
  const lintCommand = vscode.commands.registerCommand('guidemd.lint', lintCurrentFile);
  const syncCommand = vscode.commands.registerCommand('guidemd.sync', syncGuideMd);

  context.subscriptions.push(openDashboardCommand, lintCommand, syncCommand);

  // Register save listener for lint-on-save
  const saveListener = vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
    if (isGuideMdFile(document)) {
      const config = vscode.workspace.getConfiguration('guidemd');
      if (config.get('lintOnSave', true)) {
        lintDocument(document);
      }
    }
  });
  context.subscriptions.push(saveListener);

  // Register open document listener
  const openListener = vscode.workspace.onDidOpenTextDocument((document: vscode.TextDocument) => {
    if (isGuideMdFile(document)) {
      const config = vscode.workspace.getConfiguration('guidemd');
      if (config.get('showInlineDiagnostics', true)) {
        lintDocument(document);
      }
    }
  });
  context.subscriptions.push(openListener);

  // Lint currently open GUIDE.md files
  vscode.workspace.textDocuments.forEach((document: vscode.TextDocument) => {
    if (isGuideMdFile(document)) {
      lintDocument(document);
    }
  });
}

export function deactivate() {
  diagnosticCollection.dispose();
}

function isGuideMdFile(document: vscode.TextDocument): boolean {
  // Check if filename is GUIDE.md (case sensitive)
  const fileName = path.basename(document.fileName);
  return fileName === 'GUIDE.md';
}

async function checkForGuideMd() {
  const files = await vscode.workspace.findFiles('GUIDE.md', '**/node_modules/**', 1);
  await vscode.commands.executeCommand('setContext', 'workspaceHasGUIDEMD', files.length > 0);
}

async function getCliPath(): Promise<string> {
  const config = vscode.workspace.getConfiguration('guidemd');
  return config.get('cliPath', 'guidemd');
}

async function lintDocument(document: vscode.TextDocument) {
  if (!isGuideMdFile(document)) {
    return;
  }

  const cliPath = await getCliPath();
  const filePath = document.fileName;

  try {
    const { stdout } = await execAsync(`"${cliPath}" lint "${filePath}" --json`, {
      timeout: 30000,
      cwd: path.dirname(filePath),
    });

    const result: LintResult = JSON.parse(stdout);
    updateDiagnostics(document, result.diagnostics);
  } catch (error) {
    // If the command fails, the JSON output might be in stderr
    try {
      const errorStr = String(error);
      const jsonMatch = errorStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result: LintResult = JSON.parse(jsonMatch[0]);
        updateDiagnostics(document, result.diagnostics);
      } else {
        // Clear diagnostics if we can't parse the result
        diagnosticCollection.delete(document.uri);
      }
    } catch {
      diagnosticCollection.delete(document.uri);
    }
  }
}

function updateDiagnostics(document: vscode.TextDocument, diagnostics: LintDiagnostic[]) {
  const vscodeDiagnostics: vscode.Diagnostic[] = [];

  for (const d of diagnostics) {
    // Try to find the line number for the field
    let line = d.line !== undefined ? d.line - 1 : findLineForField(document, d.field);
    
    // Ensure line is within document bounds
    line = Math.max(0, Math.min(line, document.lineCount - 1));

    const lineText = document.lineAt(line).text;
    const range = new vscode.Range(
      line,
      0,
      line,
      lineText.length
    );

    const severity = d.severity === 'error' 
      ? vscode.DiagnosticSeverity.Error 
      : vscode.DiagnosticSeverity.Warning;

    const diagnostic = new vscode.Diagnostic(
      range,
      `[${d.source}] ${d.field}: ${d.message}`,
      severity
    );
    diagnostic.source = 'guidemd';
    diagnostic.code = d.field;

    vscodeDiagnostics.push(diagnostic);
  }

  diagnosticCollection.set(document.uri, vscodeDiagnostics);
}

function findLineForField(document: vscode.TextDocument, field: string): number {
  // Search for the field in the document
  const text = document.getText();
  const lines = text.split('\n');

  // Handle nested fields (e.g., "guardrails.no_hallucination")
  const fieldParts = field.split('.');
  const mainField = fieldParts[0];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Look for YAML key pattern
    if (line.match(new RegExp(`^\\s*${mainField}\\s*:`))) {
      // If we have a nested field, try to find the specific sub-field
      if (fieldParts.length > 1) {
        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          if (lines[j].match(new RegExp(`^\\s*${fieldParts[1]}\\s*:`))) {
            return j;
          }
        }
      }
      return i;
    }
  }

  return 0;
}

async function openDashboard() {
  const cliPath = await getCliPath();
  
  // Find GUIDE.md in workspace
  const files = await vscode.workspace.findFiles('GUIDE.md', '**/node_modules/**', 1);
  if (files.length === 0) {
    vscode.window.showErrorMessage('No GUIDE.md file found in workspace');
    return;
  }

  const filePath = files[0].fsPath;

  try {
    const { stdout } = await execAsync(`"${cliPath}" info "${filePath}" --json`, {
      timeout: 30000,
      cwd: path.dirname(filePath),
    });

    const result = JSON.parse(stdout);
    showDashboardWebview(result, filePath);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to generate dashboard: ${error}`);
  }
}

async function lintCurrentFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isGuideMdFile(editor.document)) {
    vscode.window.showErrorMessage('No GUIDE.md file is currently open');
    return;
  }

  await lintDocument(editor.document);
  vscode.window.showInformationMessage('GUIDE.md linting complete');
}

async function syncGuideMd() {
  const cliPath = await getCliPath();
  
  const files = await vscode.workspace.findFiles('GUIDE.md', '**/node_modules/**', 1);
  if (files.length === 0) {
    vscode.window.showErrorMessage('No GUIDE.md file found in workspace');
    return;
  }

  const filePath = files[0].fsPath;

  try {
    await execAsync(`"${cliPath}" sync "${filePath}"`, {
      timeout: 60000,
      cwd: path.dirname(filePath),
    });
    vscode.window.showInformationMessage('GUIDE.md synced with project successfully');
    
    // Refresh diagnostics after sync
    const document = await vscode.workspace.openTextDocument(filePath);
    await lintDocument(document);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to sync GUIDE.md: ${error}`);
  }
}

function showDashboardWebview(result: any, filePath: string) {
  const panel = vscode.window.createWebviewPanel(
    'guidemdDashboard',
    'GUIDE.md Dashboard',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  const gradeColor = result.grade === 'A' ? '#4ade80' : 
                     result.grade === 'B' ? '#22c55e' : 
                     result.grade === 'C' ? '#fbbf24' : '#ef4444';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GUIDE.md Dashboard</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      padding: 20px;
      background: #1e1e1e;
      color: #e0e0e0;
      line-height: 1.6;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding: 20px;
      background: #252526;
      border-radius: 8px;
      border: 1px solid #3e3e42;
    }
    .header h1 {
      font-size: 24px;
      margin-bottom: 10px;
      color: #fff;
    }
    .header p {
      color: #a0a0a0;
    }
    .score-section {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 30px;
      margin-bottom: 30px;
    }
    .grade-badge {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48px;
      font-weight: bold;
      background: ${gradeColor};
      color: #1e1e1e;
      box-shadow: 0 4px 15px ${gradeColor}40;
    }
    .score-details {
      text-align: left;
    }
    .score-number {
      font-size: 48px;
      font-weight: bold;
      color: ${gradeColor};
    }
    .score-label {
      color: #a0a0a0;
      font-size: 14px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: #252526;
      padding: 15px;
      border-radius: 8px;
      border: 1px solid #3e3e42;
    }
    .stat-label {
      color: #a0a0a0;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .stat-value {
      font-size: 18px;
      color: #fff;
    }
    .sections-list {
      background: #252526;
      border-radius: 8px;
      border: 1px solid #3e3e42;
      padding: 15px;
      margin-bottom: 20px;
    }
    .section-item {
      display: flex;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #3e3e42;
    }
    .section-item:last-child {
      border-bottom: none;
    }
    .section-icon {
      margin-right: 10px;
      font-size: 16px;
    }
    .section-name {
      flex: 1;
      color: #e0e0e0;
    }
    .section-count {
      color: #a0a0a0;
      font-size: 12px;
    }
    .suggestions {
      background: #252526;
      border-radius: 8px;
      border: 1px solid #3e3e42;
      padding: 15px;
    }
    .suggestions h3 {
      color: #fbbf24;
      margin-bottom: 10px;
    }
    .suggestion-item {
      padding: 8px 0;
      color: #e0e0e0;
      border-bottom: 1px solid #3e3e42;
    }
    .suggestion-item:last-child {
      border-bottom: none;
    }
    .present { color: #4ade80; }
    .missing { color: #ef4444; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 GUIDE.md Dashboard</h1>
    <p>${result.project} | ${Array.isArray(result.language) ? result.language.join(', ') : result.language}</p>
  </div>

  <div class="score-section">
    <div class="grade-badge">${result.grade}</div>
    <div class="score-details">
      <div class="score-number">${result.score}/100</div>
      <div class="score-label">AI-Readiness Score</div>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Word Count</div>
      <div class="stat-value">${result.stats.wordCount}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Token Density</div>
      <div class="stat-value">${result.stats.tokenDensity}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Sync Status</div>
      <div class="stat-value">${result.stats.syncStatus}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Guardrail Coverage</div>
      <div class="stat-value">${result.stats.guardrailCoverage}%</div>
    </div>
  </div>

  <div class="sections-list">
    <h3>📋 Required Sections</h3>
    ${result.sections.map((s: any) => `
      <div class="section-item">
        <span class="section-icon ${s.present ? 'present' : 'missing'}">${s.present ? '✓' : '✗'}</span>
        <span class="section-name">${s.name}</span>
        <span class="section-count">${s.wordCount} words</span>
      </div>
    `).join('')}
  </div>

  ${result.suggestions.length > 0 ? `
  <div class="suggestions">
    <h3>💡 Suggestions</h3>
    ${result.suggestions.map((s: string) => `
      <div class="suggestion-item">${s}</div>
    `).join('')}
  </div>
  ` : ''}
</body>
</html>`;

  panel.webview.html = html;
}
