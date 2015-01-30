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

/* jshint -W106 */
'use strict';

//require('longjohn');

module.exports = function (grunt) {
    // Project configuration.
    grunt.initConfig({
        // Metadata.
        pkg: grunt.file.readJSON('package.json'),

        // Task configuration.
        jshint: {
            platform: ['Gruntfile.js', 'server.js', 'lib/**/*.js'],
            options: {
                jshintrc: '.jshintrc'
            },
            /** 
             * JSHint one file
             * grunt jshint:onefile --file <file>
             */
            onefile: (grunt.option('file') ? [grunt.option('file')] : []),
            apps: ['apps/*/main.js'],
            spec: ['spec/webidaSpec.js']
        },
        jasmine_node: {
            specNameMatcher: 'spec',
            projectRoot: '.',
            requirejs: false,
            forceExit: true,
            jUnit: {
                report: true,
                savePath: './spec/reports/',
                useDotNotation: true,
                consolidate: true
            },
            varbose: true
        },
        jasmine: {
            wrapper: {
                options: {
                    host: 'http://127.0.0.1:5001/', // specify your own server
                    specs: 'spec/wrapperSpec.js',
                    template: 'spec/wrapperSpecRunner.tmpl',
                    outfile: 'out/SpecRunner.html',
                }
            }
        },
        watch: {
            scripts: {
                files: ['**/*.js'],
                tasks: ['jshint', 'jasmine_node'],
                options: {
                }
            }
        }
    });

    // These plugins provide necessary tasks.
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-jasmine-node');
    grunt.loadNpmTasks('grunt-contrib-jasmine');
    grunt.loadNpmTasks('grunt-contrib-watch');

    grunt.registerTask('wrapper-test-run', ['jasmine:wrapper']);

    // webida.js test
    grunt.registerTask('wrapper', 'test webida wrapper api test using jasmine', function() {
        //check Directory
        grunt.file.setBase('apps/app:/');

        //copy spec and library file for apps
        grunt.file.copy('../../webida.js', 'webida.js');
        grunt.file.copy('../../spec/wrapperSpec.js', 'spec/wrapperSpec.js');
        grunt.file.copy('../../spec/wrapperSpecRunner.tmpl', 'spec/wrapperSpecRunner.tmpl');
        grunt.file.copy('../../spec/library/jasmine.async.min.js', 'spec/library/jasmine.async.min.js');
        grunt.file.copy('../../spec/library/jquery-1.9.1.js', 'spec/library/jquery-1.9.1.js');
        grunt.file.copy('../../spec/library/require.js', 'spec/library/require.js');
        
        //copy deploy directory
        grunt.file.copy('../../spec/deploy/main.js', 'spec/deploy/main.js');
        grunt.file.copy('../../spec/deploy/package.json', 'spec/deploy/package.json');

        //run jasmine task
        grunt.task.run('wrapper-test-run');
    });

    // webida.js test for phantom
    grunt.registerTask('wrapperPhantom', 'test webida wrapper api test using jasmine with phantom', function() {
        //check Directory
        grunt.file.setBase('apps/app:/');

        //copy spec and library file for apps
        grunt.file.copy('../../webida.js', 'webida.js');
        grunt.file.copy('../../spec/wrapperPhantomSpec.js', 'spec/wrapperSpec.js');
        grunt.file.copy('../../spec/wrapperPhantomSpecRunner.tmpl', 'spec/wrapperSpecRunner.tmpl');
        grunt.file.copy('../../spec/library/jasmine.async.min.js', 'spec/library/jasmine.async.min.js');
        grunt.file.copy('../../spec/library/jquery-1.9.1.js', 'spec/library/jquery-1.9.1.js');
        grunt.file.copy('../../spec/library/require.js', 'spec/library/require.js');
        
        //copy deploy directory
        grunt.file.copy('../../spec/deploy/main.js', 'spec/deploy/main.js');
        grunt.file.copy('../../spec/deploy/package.json', 'spec/deploy/package.json');

        //run jasmine task
        grunt.task.run('wrapper-test-run');
    });

    // Default task.
    grunt.registerTask('default', ['jshint:platform', 'jasmine_node']);
};
