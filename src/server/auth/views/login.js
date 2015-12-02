/*
 * Copyright (c) 2012-2015 S-Core Co., Ltd.
 * 
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var currentPage = 'login';  // or findPassword
var currentContainer = $('.container_login');

function movePage(pageName) {
    if (pageName === 'login') {
        $('.container_login').css({left: '50%'});
        $('.container_passwd').css({left: '150%'});
        currentContainer = $('.container_login');
    } else {
        $('.container_login').css({left: '-50%'});
        $('.container_passwd').css({left: '50%'});
        currentContainer = $('.container_passwd');
    }
    currentPage = pageName;
}

function showFailedMessage(show, message) {
    if (show) {
        if (message && message.reason) {
            currentContainer.find('.login_failed_msg').text(message.reason);
        }
        currentContainer.find('.login_failed').removeClass('hide');
        currentContainer.find('.data-password').val('');
    } else {
        currentContainer.find('.login_failed').addClass('hide');
    }
}

function setRememberMe(remember, email) {
    var date = new Date();
    if (remember) {
        date.setDate(date.getDate() + 30);
        document.cookie = 'email=' + encodeURIComponent(email) + '; expires=' + date.toGMTString();
    } else {
        date.setDate(date.getDate() - 1);
        document.cookie = 'email=; expires=' + date.toGMTString();
    }
}

function getRememberMe() {
    var cookie = document.cookie;
    var start = cookie.indexOf('email=');
    if (start !== -1) {
        var end = cookie.indexOf(';', start);
        if (end === -1)
            end = cookie.length;
        var email = cookie.substring(cookie.indexOf('=', start) + 1, end);
        $('.data-email').val(decodeURIComponent(email));
        $('.data-password')[0].focus();
        $('.data-remember').prop('checked', true);
    }
}

function doFindPassword() {
    showFailedMessage(false);
    var email = currentContainer.find('.data-email').val();

    $.ajax({
        url: '/webida/api/oauth/forgotpassword',
        type: 'POST',
        data: {email: email},
        success: function (data) {
            data = JSON.parse(data);
            if (data.result === 'ok') {
                $('.container_passwd_success, .container_passwd_find').removeClass('hide');
            } else {
                $('.container_passwd_success, .container_passwd_find').addClass('hide');
                showFailedMessage(true, data);
            }
        },
        error: function (jqXHR) {
            showFailedMessage(true, JSON.parse(jqXHR.responseText));
        }
    });
}

function doLogin() {
    showFailedMessage(false);
    var email = currentContainer.find('.data-email').val();
    var password = currentContainer.find('.data-password').val();
    var remember = currentContainer.find('.data-remember').prop('checked');
    password = window.btoa(password);

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
            setRememberMe(remember, email);
            if (data.result === 'ok') {
                if (opener) {
                    window.opener.postMessage(data.data, location.origin);
                }
                location.href = data.data;
            } else {
                showFailedMessage(true, data);
            }
        },
        error: function (jqXHR) {
            setRememberMe(remember, email);
            showFailedMessage(true, JSON.parse(jqXHR.responseText));
        }
    });
}

function connectEvents() {
    $('.action-toggle-page').on('click', function (event) {
        var pageName = $(this).attr('data-page');
        event.preventDefault();
        movePage(pageName);
    });
    $('.action-login').on('click', function (event) {
        event.preventDefault();
        doLogin();
    });
    $('.action-find-password').on('click', function (event) {
        event.preventDefault();
        doFindPassword();
    });
    $('.data-email, .data-password').on('keydown', function (event) {
        var keyCode = event.keyCode ? event.keyCode : event.which;
        if (keyCode === 13) { // check enter key
            event.preventDefault();
            if (currentPage === 'login') {
                $('.action-login').trigger('click');
            } else {
                $('.action-find-password').trigger('click');
            }
        }
    });
}

$(document).ready(function () {
    getRememberMe();
    connectEvents();
});
