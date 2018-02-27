import * as iothub from 'azure-iothub';
import {clearInterval} from 'timers';
import * as vscode from 'vscode';

import {ConfigHandler} from '../configHandler';
import {ConfigKey} from '../constants';

import {getExtension} from './Apis';
import {extensionName} from './Interfaces/Api';
import {Component, ComponentType} from './Interfaces/Component';
import {Provisionable} from './Interfaces/Provisionable';

interface DeviceInfo {
  iothubDeviceConnectionString: string;
}

export class IoTHubDevice implements Component, Provisionable {
  private componentType: ComponentType;
  private iotHubConnectionString: string|undefined;
  private channel: vscode.OutputChannel;

  constructor(channel: vscode.OutputChannel) {
    this.componentType = ComponentType.IoTHubDevice;
    this.channel = channel;
    this.iotHubConnectionString =
        ConfigHandler.get<string>(ConfigKey.iotHubConnectionString);
  }

  name = 'IoT Hub Device';

  getComponentType(): ComponentType {
    return this.componentType;
  }

  async load(): Promise<boolean> {
    return true;
  }

  async create(): Promise<boolean> {
    return true;
  }

  async provision(): Promise<boolean> {
    if (!this.iotHubConnectionString) {
      throw new Error('No IoT Hub connection string found.');
    }

    const selection = await vscode.window.showQuickPick(
        getProvisionIothubDeviceSelection(this.iotHubConnectionString),
        {ignoreFocusOut: true, placeHolder: 'Provision IoTHub Device'});

    if (!selection) {
      return false;
    }

    const toolkit = getExtension(extensionName.Toolkit);
    if (toolkit === undefined) {
      const error = new Error('Toolkit is not installed.');
      throw error;
    }

    let device = null;
    try {
      switch (selection.detail) {
        case 'select':
          device = await toolkit.azureIoTExplorer.getDevice(
              null, this.iotHubConnectionString);
          if (device === undefined) {
            throw new Error('Cannot select the specific device');
          } else {
            await ConfigHandler.update(
                ConfigKey.iotHubDeviceConnectionString,
                device.connectionString);
          }
          break;

        case 'create':
          device = await toolkit.azureIoTExplorer.createDevice(
              false, this.iotHubConnectionString);
          if (device === undefined) {
            const error = new Error('Cannot create device.');
            throw error;
          } else {
            await ConfigHandler.update(
                ConfigKey.iotHubDeviceConnectionString,
                device.connectionString);
          }
          break;
        default:
          break;
      }
      return true;
    } catch (error) {
      throw error;
    }
  }
}

async function getProvisionIothubDeviceSelection(
    iotHubConnectionString: string) {
  let provisionIothubDeviceSelection: vscode.QuickPickItem[];

  const deviceNumber = await getDeviceNumber(iotHubConnectionString);
  if (deviceNumber > 0) {
    provisionIothubDeviceSelection = [
      {
        label: 'Select an existing IoT Hub device',
        description: 'Select an existing IoT Hub device',
        detail: 'select'
      },
      {
        label: 'Create a new IoT Hub device',
        description: 'Create a new IoT Hub device',
        detail: 'create'
      }
    ];
  } else {
    provisionIothubDeviceSelection = [{
      label: 'Create a new IoT Hub device',
      description: 'Create a new IoT Hub device',
      detail: 'create'
    }];
  }
  return provisionIothubDeviceSelection;
}

async function getDeviceNumber(iotHubConnectionString: string) {
  return new Promise(
      (resolve: (value: number) => void, reject: (error: Error) => void) => {
        const registry: iothub.Registry =
            iothub.Registry.fromConnectionString(iotHubConnectionString);
        registry.list((err, list) => {
          if (err) {
            return reject(err);
          }
          if (list === undefined) {
            return resolve(0);
          } else {
            return resolve(list.length);
          }
        });
      });
}