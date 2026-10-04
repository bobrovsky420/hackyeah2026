// The Azure server (docs/azure-deploy.md): one Ubuntu 24.04 VM with a
// static public IP and a free DNS name <dnsLabel>.<region>.cloudapp.azure.com,
// which Caddy gets a certificate for. Ports 80 and 443 are open to all; SSH
// has no rule here: the workflow opens it for the runner's address during a
// deploy and closes it after. The workflow deploys this file when the VM does
// not exist yet; the software comes from deploy/setup.sh, as on any server.

@description('Name of the VM; the other resources are named after it.')
param name string = 'router'

param location string = resourceGroup().location

@description('4 GB is the minimum (docs/server-deploy.md); 8 GB leaves room for the build next to the embedding service.')
param vmSize string = 'Standard_B2ms'

param adminUsername string = 'azureuser'

@description('The public half of the deploy key (the secret VM_SSH_PRIVATE_KEY of the workflow).')
param sshPublicKey string

@description('Lower case, unique in the region: the site is <dnsLabel>.<location>.cloudapp.azure.com.')
param dnsLabel string

param osDiskSizeGB int = 64

resource nsg 'Microsoft.Network/networkSecurityGroups@2023-11-01' = {
  name: '${name}-nsg'
  location: location
  properties: {
    securityRules: [
      {
        name: 'web'
        properties: {
          priority: 110
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRanges: ['80', '443']
        }
      }
    ]
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: '${name}-vnet'
  location: location
  properties: {
    addressSpace: { addressPrefixes: ['10.20.0.0/24'] }
    subnets: [
      {
        name: 'default'
        properties: {
          addressPrefix: '10.20.0.0/24'
          networkSecurityGroup: { id: nsg.id }
        }
      }
    ]
  }
}

resource ip 'Microsoft.Network/publicIPAddresses@2023-11-01' = {
  name: '${name}-ip'
  location: location
  sku: { name: 'Standard' }
  properties: {
    publicIPAllocationMethod: 'Static'
    dnsSettings: { domainNameLabel: dnsLabel }
  }
}

resource nic 'Microsoft.Network/networkInterfaces@2023-11-01' = {
  name: '${name}-nic'
  location: location
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          subnet: { id: vnet.properties.subnets[0].id }
          privateIPAllocationMethod: 'Dynamic'
          publicIPAddress: { id: ip.id }
        }
      }
    ]
  }
}

resource vm 'Microsoft.Compute/virtualMachines@2024-03-01' = {
  name: name
  location: location
  properties: {
    hardwareProfile: { vmSize: vmSize }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: 'ubuntu-24_04-lts'
        sku: 'server'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
        diskSizeGB: osDiskSizeGB
        managedDisk: { storageAccountType: 'StandardSSD_LRS' }
        deleteOption: 'Delete'
      }
    }
    osProfile: {
      computerName: name
      adminUsername: adminUsername
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [
            {
              path: '/home/${adminUsername}/.ssh/authorized_keys'
              keyData: sshPublicKey
            }
          ]
        }
      }
    }
    networkProfile: {
      networkInterfaces: [{ id: nic.id, properties: { deleteOption: 'Delete' } }]
    }
    diagnosticsProfile: { bootDiagnostics: { enabled: true } }
  }
}

output fqdn string = ip.properties.dnsSettings.fqdn
output publicIp string = ip.properties.ipAddress
