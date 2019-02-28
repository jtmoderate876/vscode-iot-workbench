// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
let lastLogTime = 0;
function logTime(name?: string|number) {
  const now = new Date().getTime();
  const duration = lastLogTime ? now - lastLogTime : 0;
  lastLogTime = now;
  name = name !== undefined ? '[' + name.toString() + ']' : '';
  console.log(`  IoTProject${name}: ` + duration);
}
logTime('Begin Load');
import * as fs from 'fs-plus';
logTime('fs-plus');
import * as path from 'path';
logTime('path');
import * as vscode from 'vscode';
logTime('vscode');
import {ConfigHandler} from '../configHandler';
logTime('../configHandler');
import {ConfigKey, FileNames} from '../constants';
logTime('../constants');
import {EventNames} from '../constants';
logTime('../constants');
import {TelemetryContext, TelemetryWorker} from '../telemetry';
logTime('../telemetry');
import {askAndNewProject, askAndOpenProject} from '../utils';
logTime('../utils');
import {checkAzureLogin} from './Apis';
logTime('./Apis');
import {AzureConfigFileHandler, Dependency, DependencyType} from './AzureComponentConfig';
logTime('./AzureComponentConfig');
import {Compilable} from './Interfaces/Compilable';
logTime('./Interfaces/Compilable');
import {Component, ComponentType} from './Interfaces/Component';
logTime('./Interfaces/Component');
import {Deployable} from './Interfaces/Deployable';
logTime('./Interfaces/Deployable');
import {Device} from './Interfaces/Device';
logTime('./Interfaces/Device');
import {ProjectTemplate, ProjectTemplateType} from './Interfaces/ProjectTemplate';
logTime('./Interfaces/ProjectTemplate');
import {Provisionable} from './Interfaces/Provisionable';
logTime('./Interfaces/Provisionable');
import {Uploadable} from './Interfaces/Uploadable';
logTime('./Interfaces/Uploadable');
import {Workspace} from './Interfaces/Workspace';
logTime('./Interfaces/Workspace');

type AzureFunctionsModuleType = typeof import('./AzureFunctions');
let lazyAzureFunctionsModule: AzureFunctionsModuleType|undefined;

type AzureUtilityModuleType = typeof import('./AzureUtility');
let lazyAzureUtilityModule: AzureUtilityModuleType|undefined;

type CosmosDBModuleType = typeof import('./CosmosDB');
let lazyCosmosDBModule: CosmosDBModuleType|undefined;

type AZ3166DeviceModuleType = typeof import('./AZ3166Device');
let lazyAZ3166DeviceModule: AZ3166DeviceModuleType|undefined;

type Esp32DeviceModuleType = typeof import('./Esp32Device');
let lazyEsp32DeviceModule: Esp32DeviceModuleType|undefined;

type IoTButtonDeviceModuleType = typeof import('./IoTButtonDevice');
let lazyIoTButtonDeviceModule: IoTButtonDeviceModuleType|undefined;

type IoTHubDeviceModuleType = typeof import('./IoTHubDevice');
let lazyIoTHubDeviceModule: IoTHubDeviceModuleType|undefined;

type RaspberryPiDeviceModuleType = typeof import('./RaspberryPiDevice');
let lazyRaspberryPiDeviceModule: RaspberryPiDeviceModuleType|undefined;

type IoTHubModuleType = typeof import('./IoTHub');
let lazyIoTHubModule: IoTHubModuleType|undefined;

type StreamAnalyticsJobModuleType = typeof import('./StreamAnalyticsJob');
let lazyStreamAnalyticsJobModule: StreamAnalyticsJobModuleType|undefined;

const constants = {
  deviceDefaultFolderName: 'Device',
  functionDefaultFolderName: 'Functions',
  asaFolderName: 'StreamAnalytics',
  workspaceConfigExtension: '.code-workspace'
};

interface ProjectSetting {
  name: string;
  value: string;
}

export class IoTProject {
  private componentList: Component[];
  private projectRootPath = '';
  private extensionContext: vscode.ExtensionContext;
  private channel: vscode.OutputChannel;
  private telemetryContext: TelemetryContext;

  private canProvision(comp: {}): comp is Provisionable {
    return (comp as Provisionable).provision !== undefined;
  }

  private canDeploy(comp: {}): comp is Deployable {
    return (comp as Deployable).deploy !== undefined;
  }

  private canCompile(comp: {}): comp is Compilable {
    return (comp as Compilable).compile !== undefined;
  }

  private canUpload(comp: {}): comp is Uploadable {
    return (comp as Uploadable).upload !== undefined;
  }

  constructor(
      context: vscode.ExtensionContext, channel: vscode.OutputChannel,
      telemetryContext: TelemetryContext) {
    this.componentList = [];
    this.extensionContext = context;
    this.channel = channel;
    this.telemetryContext = telemetryContext;
  }

  async load(): Promise<boolean> {
    if (!vscode.workspace.workspaceFolders) {
      return false;
    }

    const devicePath = ConfigHandler.get<string>(ConfigKey.devicePath);
    if (!devicePath) {
      return false;
    }

    this.projectRootPath =
        path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '..');

    const azureConfigFileHandler =
        new AzureConfigFileHandler(this.projectRootPath);
    azureConfigFileHandler.createIfNotExists();

    const deviceLocation = path.join(
        vscode.workspace.workspaceFolders[0].uri.fsPath, '..', devicePath);

    if (deviceLocation !== undefined) {
      const boardId = ConfigHandler.get<string>(ConfigKey.boardId);
      if (!boardId) {
        return false;
      }
      let device = null;
      if (boardId === 'devkit') {
        if (!lazyAZ3166DeviceModule) {
          lazyAZ3166DeviceModule = await import('./AZ3166Device');
        }
        const AZ3166Device = lazyAZ3166DeviceModule.AZ3166Device;
        device = new AZ3166Device(
            this.extensionContext, this.channel, deviceLocation);
      } else if (boardId === 'iotbutton') {
        if (!lazyIoTButtonDeviceModule) {
          lazyIoTButtonDeviceModule = await import('./IoTButtonDevice');
        }
        const IoTButtonDevice = lazyIoTButtonDeviceModule.IoTButtonDevice;
        device = new IoTButtonDevice(this.extensionContext, deviceLocation);
      } else if (boardId === 'esp32') {
        if (!lazyEsp32DeviceModule) {
          lazyEsp32DeviceModule = await import('./Esp32Device');
        }
        const Esp32Device = lazyEsp32DeviceModule.Esp32Device;
        device = new Esp32Device(
            this.extensionContext, this.channel, deviceLocation);
      } else if (boardId === 'raspberrypi') {
        if (!lazyRaspberryPiDeviceModule) {
          lazyRaspberryPiDeviceModule = await import('./RaspberryPiDevice');
        }
        const RaspberryPiDevice = lazyRaspberryPiDeviceModule.RaspberryPiDevice;
        device = new RaspberryPiDevice(
            this.extensionContext, deviceLocation, this.channel);
      }
      if (device) {
        this.componentList.push(device);
        await device.load();
      }
    }

    const componentConfigs = azureConfigFileHandler.getSortedComponents();
    if (!componentConfigs || componentConfigs.length === 0) {
      // Support backward compact
      if (!lazyIoTHubModule) {
        lazyIoTHubModule = await import('./IoTHub');
      }
      const IoTHub = lazyIoTHubModule.IoTHub;
      const iotHub = new IoTHub(this.projectRootPath, this.channel);
      await iotHub.updateConfigSettings();
      await iotHub.load();
      this.componentList.push(iotHub);

      if (!lazyIoTHubDeviceModule) {
        lazyIoTHubDeviceModule = await import('./IoTHubDevice');
      }
      const IoTHubDevice = lazyIoTHubDeviceModule.IoTHubDevice;
      const device = new IoTHubDevice(this.channel);
      this.componentList.push(device);

      const functionPath = ConfigHandler.get<string>(ConfigKey.functionPath);
      if (functionPath) {
        const functionLocation = path.join(
            vscode.workspace.workspaceFolders[0].uri.fsPath, '..',
            functionPath);
        if (!lazyAzureFunctionsModule) {
          console.log('Load Azure Functions from load1');
          lazyAzureFunctionsModule = await import('./AzureFunctions');
        }
        const AzureFunctions = lazyAzureFunctionsModule.AzureFunctions;
        const functionApp = new AzureFunctions(
            functionLocation, functionPath, this.channel, null,
            [{component: iotHub, type: DependencyType.Input}]);
        await functionApp.updateConfigSettings();
        await functionApp.load();
        this.componentList.push(functionApp);
      }

      this.componentList.forEach(item => {
        item.checkPrerequisites();
      });

      return true;
    }


    const components: {[key: string]: Component} = {};

    for (const componentConfig of componentConfigs) {
      switch (componentConfig.type) {
        case 'IoTHub': {
          if (!lazyIoTHubModule) {
            lazyIoTHubModule = await import('./IoTHub');
          }
          const IoTHub = lazyIoTHubModule.IoTHub;
          const iotHub = new IoTHub(this.projectRootPath, this.channel);
          await iotHub.load();
          components[iotHub.id] = iotHub;
          this.componentList.push(iotHub);

          if (!lazyIoTHubDeviceModule) {
            lazyIoTHubDeviceModule = await import('./IoTHubDevice');
          }
          const IoTHubDevice = lazyIoTHubDeviceModule.IoTHubDevice;
          const device = new IoTHubDevice(this.channel);
          this.componentList.push(device);

          break;
        }
        case 'AzureFunctions': {
          const functionPath =
              ConfigHandler.get<string>(ConfigKey.functionPath);
          if (!functionPath) {
            return false;
          }
          const functionLocation = path.join(
              vscode.workspace.workspaceFolders[0].uri.fsPath, '..',
              functionPath);
          if (functionLocation) {
            if (!lazyAzureFunctionsModule) {
              console.log('Load Azure Functions from load2');
              lazyAzureFunctionsModule = await import('./AzureFunctions');
            }
            const AzureFunctions = lazyAzureFunctionsModule.AzureFunctions;
            const functionApp = new AzureFunctions(
                functionLocation, functionPath, this.channel);
            await functionApp.load();
            components[functionApp.id] = functionApp;
            this.componentList.push(functionApp);
          }
          break;
        }
        case 'StreamAnalyticsJob': {
          const dependencies: Dependency[] = [];
          for (const dependent of componentConfig.dependencies) {
            const component = components[dependent.id];
            if (!component) {
              throw new Error(`Cannot find component with id ${dependent}.`);
            }
            dependencies.push({component, type: dependent.type});
          }
          const queryPath = path.join(
              vscode.workspace.workspaceFolders[0].uri.fsPath, '..',
              constants.asaFolderName, 'query.asaql');
          if (!lazyStreamAnalyticsJobModule) {
            lazyStreamAnalyticsJobModule = await import('./StreamAnalyticsJob');
          }
          const StreamAnalyticsJob =
              lazyStreamAnalyticsJobModule.StreamAnalyticsJob;
          const asa = new StreamAnalyticsJob(
              queryPath, this.extensionContext, this.projectRootPath,
              this.channel, dependencies);
          await asa.load();
          components[asa.id] = asa;
          this.componentList.push(asa);
          break;
        }
        case 'CosmosDB': {
          const dependencies: Dependency[] = [];
          for (const dependent of componentConfig.dependencies) {
            const component = components[dependent.id];
            if (!component) {
              throw new Error(`Cannot find component with id ${dependent}.`);
            }
            dependencies.push({component, type: dependent.type});
          }
          if (!lazyCosmosDBModule) {
            lazyCosmosDBModule = await import('./CosmosDB');
          }
          const CosmosDB = lazyCosmosDBModule.CosmosDB;
          const cosmosDB = new CosmosDB(
              this.extensionContext, this.projectRootPath, this.channel,
              dependencies);
          await cosmosDB.load();
          components[cosmosDB.id] = cosmosDB;
          this.componentList.push(cosmosDB);
          break;
        }
        default: {
          throw new Error(
              `Component not supported with type of ${componentConfig.type}.`);
        }
      }
    }

    this.componentList.forEach(item => {
      item.checkPrerequisites();
    });

    return true;
  }

  async handleLoadFailure() {
    if (!vscode.workspace.workspaceFolders ||
        !vscode.workspace.workspaceFolders[0]) {
      await askAndNewProject(this.telemetryContext);
      return;
    }

    const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const workbenchFileName =
        path.join(rootPath, 'Device', FileNames.iotworkbenchprojectFileName);

    const workspaceFiles = fs.readdirSync(rootPath).filter(
        file => path.extname(file).endsWith(FileNames.workspaceExtensionName));

    if (fs.existsSync(workbenchFileName) && workspaceFiles &&
        workspaceFiles[0]) {
      await askAndOpenProject(
          rootPath, workspaceFiles[0], this.telemetryContext);
    } else {
      await askAndNewProject(this.telemetryContext);
    }
  }

  async compile(): Promise<boolean> {
    for (const item of this.componentList) {
      if (this.canCompile(item)) {
        const isPrerequisitesAchieved = await item.checkPrerequisites();
        if (!isPrerequisitesAchieved) {
          return false;
        }

        const res = await item.compile();
        if (res === false) {
          const error = new Error(
              'Unable to compile the device code, please check output window for detail.');
          throw error;
        }
      }
    }
    return true;
  }

  async upload(): Promise<boolean> {
    for (const item of this.componentList) {
      if (this.canUpload(item)) {
        const isPrerequisitesAchieved = await item.checkPrerequisites();
        if (!isPrerequisitesAchieved) {
          return false;
        }

        const res = await item.upload();
        if (res === false) {
          const error = new Error(
              'Unable to upload the sketch, please check output window for detail.');
          throw error;
        }
      }
    }
    return true;
  }

  async provision(): Promise<boolean> {
    const devicePath = ConfigHandler.get<string>(ConfigKey.devicePath);
    if (!devicePath) {
      throw new Error(
          'Cannot run IoT Device Workbench command in a non-IoTWorkbench project. Please initialize an IoT Device Workbench project first.');
    }

    const provisionItemList: string[] = [];
    for (const item of this.componentList) {
      if (this.canProvision(item)) {
        const isPrerequisitesAchieved = await item.checkPrerequisites();
        if (!isPrerequisitesAchieved) {
          return false;
        }

        provisionItemList.push(item.name);
      }
    }

    if (provisionItemList.length === 0) {
      // nothing to provision:
      vscode.window.showInformationMessage(
          'Congratulations! There is no Azure service to provision in this project.');
      return false;
    }

    // Ensure azure login before component provision
    let subscriptionId: string|undefined = '';
    let resourceGroup: string|undefined = '';
    if (provisionItemList.length > 0) {
      await checkAzureLogin();
      if (!lazyAzureUtilityModule) {
        console.log('Load Azure Utility from provision');
        lazyAzureUtilityModule = await import('./AzureUtility');
      }
      const AzureUtility = lazyAzureUtilityModule.AzureUtility;
      AzureUtility.init(this.extensionContext, this.channel);
      resourceGroup = await AzureUtility.getResourceGroup();
      subscriptionId = AzureUtility.subscriptionId;
      if (!resourceGroup || !subscriptionId) {
        return false;
      }
    } else {
      return false;
    }

    for (const item of this.componentList) {
      const _provisionItemList: string[] = [];
      if (this.canProvision(item)) {
        for (let i = 0; i < provisionItemList.length; i++) {
          if (provisionItemList[i] === item.name) {
            _provisionItemList[i] = `>> ${i + 1}. ${provisionItemList[i]}`;
          } else {
            _provisionItemList[i] = `${i + 1}. ${provisionItemList[i]}`;
          }
        }
        const selection = await vscode.window.showQuickPick(
            [{
              label: _provisionItemList.join('   -   '),
              description: '',
              detail: 'Click to continue'
            }],
            {ignoreFocusOut: true, placeHolder: 'Provision process'});

        if (!selection) {
          return false;
        }

        const res = await item.provision();
        if (res === false) {
          vscode.window.showWarningMessage('Provision canceled.');
          return false;
        }
      }
    }
    return true;
  }

  async deploy(): Promise<boolean> {
    let azureLoggedIn = false;

    const deployItemList: string[] = [];
    for (const item of this.componentList) {
      if (this.canDeploy(item)) {
        const isPrerequisitesAchieved = await item.checkPrerequisites();
        if (!isPrerequisitesAchieved) {
          return false;
        }

        deployItemList.push(item.name);
      }
    }

    if (deployItemList && deployItemList.length <= 0) {
      await vscode.window.showInformationMessage(
          'Congratulations! The project does not contain any Azure components to be deployed.');
      return false;
    }

    if (!azureLoggedIn) {
      azureLoggedIn = await checkAzureLogin();
    }

    for (const item of this.componentList) {
      const _deployItemList: string[] = [];
      if (this.canDeploy(item)) {
        for (let i = 0; i < deployItemList.length; i++) {
          if (deployItemList[i] === item.name) {
            _deployItemList[i] = `>> ${i + 1}. ${deployItemList[i]}`;
          } else {
            _deployItemList[i] = `${i + 1}. ${deployItemList[i]}`;
          }
        }
        const selection = await vscode.window.showQuickPick(
            [{
              label: _deployItemList.join('   -   '),
              description: '',
              detail: 'Click to continue'
            }],
            {ignoreFocusOut: true, placeHolder: 'Deploy process'});

        if (!selection) {
          return false;
        }

        const res = await item.deploy();
        if (res === false) {
          const error = new Error(`The deployment of ${item.name} failed.`);
          throw error;
        }
      }
    }

    vscode.window.showInformationMessage('Azure deploy succeeded.');

    return true;
  }

  async create(
      rootFolderPath: string, projectTemplateItem: ProjectTemplate,
      boardId: string, openInNewWindow: boolean): Promise<boolean> {
    if (!fs.existsSync(rootFolderPath)) {
      throw new Error(
          'Unable to find the root path, please open the folder and initialize project again.');
    }

    this.projectRootPath = rootFolderPath;

    const workspace: Workspace = {folders: [], settings: {}};

    // Whatever the template is, we will always create the device.
    const deviceDir =
        path.join(this.projectRootPath, constants.deviceDefaultFolderName);

    if (!fs.existsSync(deviceDir)) {
      fs.mkdirSync(deviceDir);
    }

    // initialize the storage for azure component settings
    const azureConfigFileHandler =
        new AzureConfigFileHandler(this.projectRootPath);
    azureConfigFileHandler.createIfNotExists();

    workspace.folders.push({path: constants.deviceDefaultFolderName});
    let device: Component;
    if (boardId === 'devkit') {
      if (!lazyAZ3166DeviceModule) {
        lazyAZ3166DeviceModule = await import('./AZ3166Device');
      }
      const AZ3166Device = lazyAZ3166DeviceModule.AZ3166Device;
      device = new AZ3166Device(
          this.extensionContext, this.channel, deviceDir,
          projectTemplateItem.sketch);
    } else if (boardId === 'iotbutton') {
      if (!lazyIoTButtonDeviceModule) {
        lazyIoTButtonDeviceModule = await import('./IoTButtonDevice');
      }
      const IoTButtonDevice = lazyIoTButtonDeviceModule.IoTButtonDevice;
      device = new IoTButtonDevice(
          this.extensionContext, deviceDir, projectTemplateItem.sketch);
    } else if (boardId === 'esp32') {
      if (!lazyEsp32DeviceModule) {
        lazyEsp32DeviceModule = await import('./Esp32Device');
      }
      const Esp32Device = lazyEsp32DeviceModule.Esp32Device;
      device = new Esp32Device(
          this.extensionContext, this.channel, deviceDir,
          projectTemplateItem.sketch);
    } else if (boardId === 'raspberrypi') {
      if (!lazyRaspberryPiDeviceModule) {
        lazyRaspberryPiDeviceModule = await import('./RaspberryPiDevice');
      }
      const RaspberryPiDevice = lazyRaspberryPiDeviceModule.RaspberryPiDevice;
      device = new RaspberryPiDevice(
          this.extensionContext, deviceDir, this.channel,
          projectTemplateItem.sketch);
    } else {
      throw new Error('The specified board is not supported.');
    }

    const isPrerequisitesAchieved = await device.checkPrerequisites();
    if (!isPrerequisitesAchieved) {
      return false;
    }

    workspace.settings[`IoTWorkbench.${ConfigKey.boardId}`] = boardId;
    this.componentList.push(device);

    // TODO: Consider naming for project level settings.
    const settings = {projectsettings: [] as ProjectSetting[]};
    settings.projectsettings.push(
        {name: ConfigKey.devicePath, value: constants.deviceDefaultFolderName});

    workspace.settings[`IoTWorkbench.${ConfigKey.devicePath}`] =
        constants.deviceDefaultFolderName;

    const type: ProjectTemplateType = (ProjectTemplateType)
        [projectTemplateItem.type as keyof typeof ProjectTemplateType];

    switch (type) {
      case ProjectTemplateType.Basic:
        // Save data to configFile
        break;
      case ProjectTemplateType.IotHub: {
        if (!lazyIoTHubModule) {
          lazyIoTHubModule = await import('./IoTHub');
        }
        const IoTHub = lazyIoTHubModule.IoTHub;
        const iothub = new IoTHub(this.projectRootPath, this.channel);
        const isPrerequisitesAchieved = await iothub.checkPrerequisites();
        if (!isPrerequisitesAchieved) {
          return false;
        }
        this.componentList.push(iothub);
        break;
      }
      case ProjectTemplateType.AzureFunctions: {
        if (!lazyIoTHubModule) {
          lazyIoTHubModule = await import('./IoTHub');
        }
        const IoTHub = lazyIoTHubModule.IoTHub;
        const iothub = new IoTHub(this.projectRootPath, this.channel);
        const isIotHubPrerequisitesAchieved = await iothub.checkPrerequisites();
        if (!isIotHubPrerequisitesAchieved) {
          return false;
        }

        const functionDir = path.join(
            this.projectRootPath, constants.functionDefaultFolderName);

        if (!fs.existsSync(functionDir)) {
          fs.mkdirSync(functionDir);
        }

        workspace.folders.push({path: constants.functionDefaultFolderName});

        if (!lazyAzureFunctionsModule) {
          console.log('Load Azure Functions from create');
          lazyAzureFunctionsModule = await import('./AzureFunctions');
        }
        const AzureFunctions = lazyAzureFunctionsModule.AzureFunctions;
        const azureFunctions = new AzureFunctions(
            functionDir, constants.functionDefaultFolderName, this.channel,
            null,
            [{component: iothub, type: DependencyType.Input}] /*Dependencies*/);
        const isFunctionsPrerequisitesAchieved =
            await azureFunctions.checkPrerequisites();
        if (!isFunctionsPrerequisitesAchieved) {
          return false;
        }
        settings.projectsettings.push({
          name: ConfigKey.functionPath,
          value: constants.functionDefaultFolderName
        });

        workspace.settings[`IoTWorkbench.${ConfigKey.functionPath}`] =
            constants.functionDefaultFolderName;

        this.componentList.push(iothub);
        this.componentList.push(azureFunctions);
        break;
      }
      case ProjectTemplateType.StreamAnalytics: {
        if (!lazyIoTHubModule) {
          lazyIoTHubModule = await import('./IoTHub');
        }
        const IoTHub = lazyIoTHubModule.IoTHub;
        const iothub = new IoTHub(this.projectRootPath, this.channel);
        const isIotHubPrerequisitesAchieved = await iothub.checkPrerequisites();
        if (!isIotHubPrerequisitesAchieved) {
          return false;
        }
        if (!lazyCosmosDBModule) {
          lazyCosmosDBModule = await import('./CosmosDB');
        }
        const CosmosDB = lazyCosmosDBModule.CosmosDB;
        const cosmosDB = new CosmosDB(
            this.extensionContext, this.projectRootPath, this.channel);
        const isCosmosDBPrerequisitesAchieved =
            await cosmosDB.checkPrerequisites();
        if (!isCosmosDBPrerequisitesAchieved) {
          return false;
        }

        const asaDir = path.join(this.projectRootPath, constants.asaFolderName);

        if (!fs.existsSync(asaDir)) {
          fs.mkdirSync(asaDir);
        }

        const asaFilePath = this.extensionContext.asAbsolutePath(
            path.join(FileNames.resourcesFolderName, 'asaql', 'query.asaql'));
        const queryPath = path.join(asaDir, 'query.asaql');
        const asaQueryContent =
            fs.readFileSync(asaFilePath, 'utf8')
                .replace(/\[input\]/, `"iothub-${iothub.id}"`)
                .replace(/\[output\]/, `"cosmosdb-${cosmosDB.id}"`);
        fs.writeFileSync(queryPath, asaQueryContent);
        if (!lazyStreamAnalyticsJobModule) {
          lazyStreamAnalyticsJobModule = await import('./StreamAnalyticsJob');
        }
        const StreamAnalyticsJob =
            lazyStreamAnalyticsJobModule.StreamAnalyticsJob;
        const asa = new StreamAnalyticsJob(
            queryPath, this.extensionContext, this.projectRootPath,
            this.channel, [
              {component: iothub, type: DependencyType.Input},
              {component: cosmosDB, type: DependencyType.Other}
            ]);
        const isAsaPrerequisitesAchieved = await asa.checkPrerequisites();
        if (!isAsaPrerequisitesAchieved) {
          return false;
        }

        workspace.folders.push({path: constants.asaFolderName});
        workspace.settings[`IoTWorkbench.${ConfigKey.asaPath}`] =
            constants.asaFolderName;

        this.componentList.push(iothub);
        this.componentList.push(cosmosDB);
        this.componentList.push(asa);
        break;
      }
      default:
        break;
    }

    // Component level creation
    // we cannot use forEach here:
    // https://stackoverflow.com/questions/37576685/using-async-await-with-a-foreach-loop
    // this.componentList.forEach(async (element: Component) => {
    //   await element.create();
    // });

    try {
      for (let i = 0; i < this.componentList.length; i++) {
        const res = await this.componentList[i].create();
        if (res === false) {
          fs.removeSync(this.projectRootPath);
          vscode.window.showWarningMessage('Project initialize canceled.');
          return false;
        }
      }
    } catch (error) {
      throw error;
    }

    const workspaceConfigFilePath = path.join(
        this.projectRootPath,
        `${path.basename(this.projectRootPath)}${
            constants.workspaceConfigExtension}`);

    fs.writeFileSync(
        workspaceConfigFilePath, JSON.stringify(workspace, null, 4));

    if (!openInNewWindow) {
      // Need to add telemetry here otherwise, after restart VSCode, no
      // telemetry data will be sent.
      try {
        TelemetryWorker.sendEvent(
            EventNames.createNewProjectEvent, this.telemetryContext);
      } catch {
        // If sending telemetry failed, skip the error to avoid blocking user.
      }
    }

    try {
      setTimeout(
          () => vscode.commands.executeCommand(
              'vscode.openFolder', vscode.Uri.file(workspaceConfigFilePath),
              openInNewWindow),
          1000);
      return true;
    } catch (error) {
      throw error;
    }
  }

  async configDeviceSettings(): Promise<boolean> {
    for (const component of this.componentList) {
      if (component.getComponentType() === ComponentType.Device) {
        const device = component as Device;
        try {
          await device.configDeviceSettings();
        } catch (error) {
          throw error;
        }
      }
    }
    return true;
  }
}
