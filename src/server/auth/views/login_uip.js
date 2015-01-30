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

function doFindPWFailed(msg) {
    console.log(msg);
    $('.passwd_failed_msg').toggleClass('hide');
    document.getElementById("email_pw").value = '';
    setTimeout(function () { $('.passwd_failed_msg').toggleClass('hide')}, 2000);
}

function doFindPW() {
    var email = document.getElementById("email_pw").value;

    $.ajax({
        url: '/webida/api/oauth/forgotpassword',
        type: 'POST',
        data: {email: email},
        success: function (data) {
            data = JSON.parse(data);
            if (data.result === 'ok') {
                $('.container_passwd_success').toggleClass('hide');
                $('.container_passwd_find').toggleClass('hide');
                setTimeout(function () {
                    $('.container_passwd_success').toggleClass('hide');
                    $('.container_passwd_find').toggleClass('hide');
                    document.getElementById("email_pw").value = '';
                }, 5000);
            } else {
                doFindPWFailed(data.reason);
            }
        },
        error: function (jqXHR) {
            doFindPWFailed(jqXHR.responseText);
        }
    });
}

function goLogin() {
    $('.container_login').css({left:'50%'});
    $('.container_passwd').css({left: '150%'});
}

function goFindPassword() {
    $('.container_login').css({left:'-50%'});
    $('.container_passwd').css({left: '50%'});
}

function doLoginFailed(msg) {
    console.log(msg);
    $('#login_failed_msg').text(msg);
    $('.login_failed').toggleClass('hide');
    document.getElementById('password').value = "";
    setTimeout(function () { $('.login_failed').toggleClass('hide')}, 3000);
}

function doLogin() {
    var email = document.getElementById("email").value;
    var password = document.getElementById("password").value;
    var remember = document.getElementById("rememberemail");
    password = window.btoa(password);

    if (remember.checked) {
        var date = new Date();
        date.setDate(date.getDate() + 30);
        document.cookie = 'email=' + escape(email) + '; expires=' + date.toGMTString();
    } else {
        var date = new Date();
        date.setDate(date.getDate() - 1);
        document.cookie = 'email=; expires=' + date.toGMTString();
    }

    var formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);

    $.ajax({
        url: '/login',
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function (data) {
            data = JSON.parse(data);
            if (data.result === 'ok') {
                if (opener) {
                    window.opener.postMessage(data.data, location.origin);
                }
                location.href = data.data;
            } else {
                doLoginFailed('Invalid Name or password');
            }
        },
        error: function (jqXHR) {
            var msg;
            if (jqXHR.status === 470) {
                msg = 'Not approved yet, ask the manager...';
            } else if (jqXHR.status === 472) {
                msg = 'Rejected, ask the manager...';
            } else {
                msg = 'Invalid Name or password';
            }

            doLoginFailed(msg);
        }
    });
}

function onSubmit(event) {
    var keyCode = event.keyCode ? event.keyCode : event.which;
    if (keyCode == 13) { // check enter key
        document.getElementById('passwd_button').click();
    }
}

function onLogin(event) {
    var keyCode = event.keyCode ? event.keyCode : event.which;
    if (keyCode == 13) { // check enter key
        document.getElementById('loginbutton').click();
    }
}

window.onload = function (event) {
    var cookie = document.cookie;
    var start = cookie.indexOf('email=');
    if (start !== -1) {
        var end = cookie.indexOf(';', start);
        if (end == -1)
            end = cookie.length;

        var email = cookie.substring(cookie.indexOf('=', start) + 1, end);
        document.getElementById("email").value = unescape(email);
        document.getElementById("password").focus();
        document.getElementById("rememberemail").checked = true;
    }
}

