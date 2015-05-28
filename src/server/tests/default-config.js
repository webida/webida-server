// test server information for unit test
(function () {
    var conf = {
        // test account 1
        testUser: {
            uid: -1,
            email: '',
            status: 1,
            password: ''
        },

        // personal token of test account 1
        personalToken: '',

        // fsinfo of test account 1
        testFS: {
            owner: -1,
            fsid: ''
        },

        // test account 2
        testUser2: {
            uid: -1,
            email: '',
            status: 1,
            password: ''
        }
    };

    // export for RequreJS
    define([], function () {
        return conf;
    });
}());
