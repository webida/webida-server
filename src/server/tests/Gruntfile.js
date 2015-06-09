module.exports = function(grunt) {
  // Project configuration.
  grunt.initConfig({
    qunit: {
      options: {
        'phantomPath': 'node_modules/phantomjs/bin/phantomjs' //Path to Your Phantomjs
      },
      testserver: {
        options: {
          urls: [
            'http://localhost:8000/testRunner.html' // Your Qunit Runner
          ]
        }
      }
    },
    qunit_junit: {
      options: {
        dest: 'report/'
      }
    },
    connect: {
      testserver: {
        options: {
          port: 8000,
          base: '.'
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-croc-qunit');
  grunt.loadNpmTasks('grunt-qunit-junit');

  // A convenient task alias.
  grunt.registerTask('test', ['connect', 'qunit_junit', 'qunit']);
};
