// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';
const startTime = new Date().getTime();
let lastLogTime = 0;
function logTime(name?: string|number) {
  const now = new Date().getTime();
  const duration = lastLogTime ? now - lastLogTime : 0;
  lastLogTime = now;
  name = name !== undefined ? '[' + name.toString() + ']' : '';
  console.log(`IDW${name}: ` + duration);
}

logTime('Begin Load');
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
logTime('vscode');
import {ProjectInitializer} from './projectInitializer';
logTime('./projectInitializer');
import {DeviceOperator} from './DeviceOperator';
logTime('./DeviceOperator');
import {AzureOperator} from './AzureOperator';
logTime('./AzureOperator');
import {ExampleExplorer} from './exampleExplorer';
logTime('./exampleExplorer');
import {IoTWorkbenchSettings} from './IoTSettings';
logTime('./IoTSettings');
import {ConfigHandler} from './configHandler';
logTime('./configHandler');
import {ConfigKey, EventNames, ContentView} from './constants';
logTime('./constants');
import {ContentProvider} from './contentProvider';
logTime('./contentProvider');
import {TelemetryContext, callWithTelemetry, TelemetryWorker} from './telemetry';
logTime('./telemetry');
import {UsbDetector} from './usbDetector';
logTime('./usbDetector');
import {HelpProvider} from './helpProvider';
logTime('./helpProvider');

type IoTProjectModuleType = typeof import('./Models/IoTProject');
let lazyIoTProjectModule: IoTProjectModuleType|undefined;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  logTime('Begin Activate');
  // Use the console to output diagnostic information (console.log) and errors
  // (console.error) This line of code will only be executed once when your
  // extension is activated
  console.log(
      'Congratulations, your extension "vscode-iot-workbench" is now active!');

  const outputChannel: vscode.OutputChannel =
      vscode.window.createOutputChannel('Azure IoT Device Workbench');
  // Initialize Telemetry
  TelemetryWorker.Initialize(context);
  const telemetryContext: TelemetryContext = {
    properties: {result: 'Succeeded', error: '', errorMessage: ''},
    measurements: {duration: 0}
  };
  if (!lazyIoTProjectModule) {
    lazyIoTProjectModule = await import('./Models/IoTProject');
  }
  const IoTProject = lazyIoTProjectModule.IoTProject;
  const iotProject = new IoTProject(context, outputChannel, telemetryContext);
  if (vscode.workspace.workspaceFolders) {
    try {
      await iotProject.load();
    } catch (error) {
      // do nothing as we are not sure whether the project is initialized.
    }
  }
  const projectInitializer = new ProjectInitializer();
  const projectInitializerBinder =
      projectInitializer.InitializeProject.bind(projectInitializer);

  const deviceOperator = new DeviceOperator();
  const azureOperator = new AzureOperator();

  const exampleExplorer = new ExampleExplorer();
  const exampleSelectBoardBinder =
      exampleExplorer.selectBoard.bind(exampleExplorer);
  const initializeExampleBinder =
      exampleExplorer.initializeExample.bind(exampleExplorer);
  ContentProvider.getInstance().Initialize(
      context.extensionPath, exampleExplorer);
  context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
          ContentView.workbenchContentProtocol, ContentProvider.getInstance()));
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json

  const projectInitProvider = async () => {
    callWithTelemetry(
        EventNames.createNewProjectEvent, outputChannel, true, context,
        projectInitializerBinder);
  };

  const azureProvisionProvider = async () => {
    callWithTelemetry(
        EventNames.azureProvisionEvent, outputChannel, true, context,
        azureOperator.Provision);
  };

  const azureDeployProvider = async () => {
    callWithTelemetry(
        EventNames.azureDeployEvent, outputChannel, true, context,
        azureOperator.Deploy);
  };

  const deviceCompileProvider = async () => {
    callWithTelemetry(
        EventNames.deviceCompileEvent, outputChannel, true, context,
        deviceOperator.compile);
  };

  const deviceUploadProvider = async () => {
    callWithTelemetry(
        EventNames.deviceUploadEvent, outputChannel, true, context,
        deviceOperator.upload);
  };

  const devicePackageManager = async () => {
    callWithTelemetry(
        EventNames.devicePackageEvent, outputChannel, true, context,
        deviceOperator.downloadPackage);
  };

  const deviceSettingsConfigProvider = async () => {
    callWithTelemetry(
        EventNames.configDeviceSettingsEvent, outputChannel, true, context,
        deviceOperator.configDeviceSettings);
  };

  const examplesProvider = async () => {
    callWithTelemetry(
        EventNames.openExamplePageEvent, outputChannel, true, context,
        exampleSelectBoardBinder);
  };

  const examplesInitializeProvider = async () => {
    callWithTelemetry(
        EventNames.loadExampleEvent, outputChannel, true, context,
        initializeExampleBinder);
  };
  const projectInit = vscode.commands.registerCommand(
      'iotworkbench.initializeProject', projectInitProvider);

  const examples = vscode.commands.registerCommand(
      'iotworkbench.examples', examplesProvider);

  const exampleInitialize = vscode.commands.registerCommand(
      'iotworkbench.exampleInitialize', examplesInitializeProvider);

  const deviceCompile = vscode.commands.registerCommand(
      'iotworkbench.deviceCompile', deviceCompileProvider);

  const deviceUpload = vscode.commands.registerCommand(
      'iotworkbench.deviceUpload', deviceUploadProvider);

  const azureProvision = vscode.commands.registerCommand(
      'iotworkbench.azureProvision', azureProvisionProvider);

  const azureDeploy = vscode.commands.registerCommand(
      'iotworkbench.azureDeploy', azureDeployProvider);

  const deviceToolchain = vscode.commands.registerCommand(
      'iotworkbench.installToolchain', devicePackageManager);

  const configureDevice = vscode.commands.registerCommand(
      'iotworkbench.configureDevice', deviceSettingsConfigProvider);

  const helpInit =
      vscode.commands.registerCommand('iotworkbench.help', async () => {
        await HelpProvider.open(context);
        return;
      });

  const workbenchPath =
      vscode.commands.registerCommand('iotworkbench.workbench', async () => {
        const settings = new IoTWorkbenchSettings();
        await settings.setWorkbenchPath();
        return;
      });
  context.subscriptions.push(projectInit);
  context.subscriptions.push(examples);
  context.subscriptions.push(exampleInitialize);
  context.subscriptions.push(helpInit);
  context.subscriptions.push(workbenchPath);
  context.subscriptions.push(deviceCompile);
  context.subscriptions.push(deviceUpload);
  context.subscriptions.push(azureProvision);
  context.subscriptions.push(azureDeploy);
  context.subscriptions.push(deviceToolchain);
  context.subscriptions.push(configureDevice);
  const usbDetector = new UsbDetector(context, outputChannel);
  usbDetector.startListening();
  const shownHelpPage = ConfigHandler.get<boolean>(ConfigKey.shownHelpPage);
  if (!shownHelpPage) {
    // Do not execute help command here
    // Help command may open board help link
    const panel = vscode.window.createWebviewPanel(
        'IoTWorkbenchHelp', 'Welcome - Azure IoT Device Workbench',
        vscode.ViewColumn.One, {
          enableScripts: true,
          retainContextWhenHidden: true,
        });

    panel.webview.html =
        await ContentProvider.getInstance().provideTextDocumentContent(
            vscode.Uri.parse(ContentView.workbenchHelpURI));

    ConfigHandler.update(
        ConfigKey.shownHelpPage, true, vscode.ConfigurationTarget.Global);
  }
  logTime('Activated');
  console.log('Total duration: ' + (new Date().getTime() - startTime));
}

// this method is called when your extension is deactivated
export async function deactivate() {
  await TelemetryWorker.dispose();
}