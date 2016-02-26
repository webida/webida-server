/*
* Copyright (c) 2012-2015 S-Core Co., Ltd.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

/**
 * @file
 * create-site-conf.js 
 *
 * @see
 * @since 1.7.0
 * @author gseok.seo@gmail.com
 * @author lunaris@gmail.com
 */

'use strict';

var _ = require('lodash');
var path = require('path');
var url = require('url');
var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var config = require('./common/conf-manager').conf;
var NAME = {
    SITE_CONFIG: 'site-config.json',
    SITE_CONFIG_EXAMPLE: 'site-config-example.json'
};

/**
 * get all system apps information
 */
function getSystemAppInfos() {
    return Promise.resolve(config.systemApps);
}

/**
 * set all system apps path
 */
function setSystemAppPaths(systemAppInfos) {
    var appsPath = config.services.app.appsPath;

    return Promise.map(systemAppInfos, function(systemAppInfo) {
        systemAppInfo.path = path.join(appsPath, systemAppInfo.id);
        return systemAppInfo;
    });
}

/**
 * set all system apps site config,
 * each site config template is must pre-defined in each app.
 * each site config template name is 'site-config-example.json'
 */
function setSiteConfig(systemAppInfos) {
    return Promise.map(systemAppInfos, function (systemAppInfo) {
        var appSiteConfExamplePath =
                path.join(systemAppInfo.path, NAME.SITE_CONFIG_EXAMPLE);

        return fs.readFileAsync(appSiteConfExamplePath, 'utf8')
        .then(function (data) {
            systemAppInfo.siteConfig = JSON.parse(data);
            return systemAppInfo; 
        });
    });
}

/**
 * get protocol,
 * this value is defined in conf.js's useSecureProtocol
 */
function getProtocol() {
    return config.useSecureProtocol ? 'https://' : 'http://'; 
}

/**
 * get base url,
 * this value is combined for conf.js's values
 * (userSecureProtocol, useReverseProxy, domin).
 */
function getBaseUrl() {
    return config.serviceInstances.app[0].url;
}

/**
 * set site configuration data,
 * these configurations data is defined in conf.js
 */
function setSiteConfigData(systemAppInfos) {
    function setServerData(systemAppInfo) {
        var serverInfo = systemAppInfo.siteConfig.server;

        serverInfo.appServer = config.appHostUrl;
        serverInfo.authServer = config.authHostUrl;
        serverInfo.fsServer = config.fsHostUrl;
        serverInfo.buildServer = config.buildHostUrl;
        serverInfo.ntfServer = config.ntfHostUrl;
        serverInfo.corsServer = config.corsHostUrl;
        serverInfo.connServer = config.connHostUrl;
    }

    function setAppData(systemAppInfo) {
        var appInfo = systemAppInfo.siteConfig.app;
        var baseUrl = getBaseUrl();

        // appId setting
        appInfo.appId = systemAppInfo.id;

        // baseUrl setting
        appInfo.baseUrl = url.resolve(baseUrl, appInfo.appId);

        // oauth clientId setting
        appInfo.oauth.clientId = systemAppInfo.oAuthClientId;

        // oauth redirectUrl setting
        appInfo.oauth.redirectUrl =
                url.resolve(appInfo.baseUrl, systemAppInfo.redirectUrl);
    }

    // this is very temp code, this code support only (ide, dashboard) app
    function setOtherAppDependentData(systemAppInfos) {
        return Promise.map(systemAppInfos, function (systemAppInfo) {
            var appInfo = systemAppInfo.siteConfig.app;
            var otherAppInfo;

            if (appInfo.ideBaseUrl) {
                otherAppInfo = _.find(systemAppInfos, function (info) {
                    return info.id === 'webida-client';
                });
                appInfo.ideBaseUrl = otherAppInfo.siteConfig.app.baseUrl;
            } else if (appInfo.dashboardBaseUrl) {
                otherAppInfo = _.find(systemAppInfos, function (info) { 
                     return info.id === 'app-dashboard'; 
                });
                appInfo.dashboardBaseUrl = otherAppInfo.siteConfig.app.baseUrl;
            }
            return systemAppInfo;
        });
    }

    return Promise.map(systemAppInfos, function (systemAppInfo) {
        setServerData(systemAppInfo);
        setAppData(systemAppInfo);
        return systemAppInfo;
    }).then(setOtherAppDependentData);
}

/**
 * write 'site-config.json' file in each system app's directory
 */
function writeSiteConfigFile(systemAppInfos) {
    return Promise.map(systemAppInfos, function (systemAppInfo) {
        var appSiteConfPath =
                path.join(systemAppInfo.path, NAME.SITE_CONFIG);
        var data = JSON.stringify(systemAppInfo.siteConfig, null, 4); // indent

        return fs.writeFileAsync(appSiteConfPath, data);
    });
} 

/**
 * create 'site-config.json' file
 */
function create() {
    getSystemAppInfos()
    .then(setSystemAppPaths)
    .then(setSiteConfig)
    .then(setSiteConfigData)
    .then(writeSiteConfigFile)
    .then(function () {
        console.log('create completed.');
        process.exit(); 
    }).catch(function(err) {
        console.log('create failed.', err);
        process.exit(1);
    });
}

create();

exports.create = create;

